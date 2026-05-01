import fs from "node:fs";
import { db } from "@/server/db/client";
import { callLLM } from "@/server/llm/router";
import { parseLlmJsonWithRetry } from "@/server/llm/json";
import { ANALYZE_SYSTEM, buildAnalyzeUserPrompt, PageAnalysisSchema, type PageAnalysis } from "@/server/llm/prompts/analyzePage";
import { GENERATE_SYSTEM, buildGenerateUserPrompt, TestPlanSchema, type TestPlan } from "@/server/llm/prompts/generateTests";
import { emitProject } from "./emit-project";
import { projectOutDir } from "@/server/crawler/paths";
import { withLock } from "@/server/util/lock";

export type GenerateProgress =
  | { type: "analyze"; url: string }
  | { type: "analyze_done"; url: string; elements: number; cached: number }
  | { type: "plan" }
  | { type: "plan_done"; cases: number }
  | { type: "emit"; outDir: string }
  | { type: "emit_done"; tests: number; warnings: string[] }
  | { type: "fail"; message: string };

export async function generateProject(
  projectId: number,
  pageIds: number[],
  onProgress: (p: GenerateProgress) => void
): Promise<{ outDir: string; testCount: number } | null> {
  return withLock(`project:${projectId}:generate`, () => generateProjectInner(projectId, pageIds, onProgress));
}

async function generateProjectInner(
  projectId: number,
  pageIds: number[],
  onProgress: (p: GenerateProgress) => void
): Promise<{ outDir: string; testCount: number } | null> {
  const project = db().prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
    | { id: number; slug: string; name: string; root_url: string }
    | undefined;
  if (!project) throw new Error("project not found");

  // load captures for the requested pages
  const placeholders = pageIds.map(() => "?").join(",");
  const captures = db().prepare(
    `SELECT p.id as page_id, p.url, pc.trimmed_path, pc.dom_hash
     FROM pages p JOIN page_captures pc ON pc.page_id = p.id
     WHERE p.project_id = ? AND p.id IN (${placeholders})
     ORDER BY pc.captured_at DESC`
  ).all(project.id, ...pageIds) as Array<{ page_id: number; url: string; trimmed_path: string; dom_hash: string }>;
  if (captures.length === 0) throw new Error("no captures for selected pages");

  // dedupe by dom_hash so we don't analyse the same content twice
  const seenHash = new Set<string>();
  const unique = captures.filter((c) => (seenHash.has(c.dom_hash) ? false : (seenHash.add(c.dom_hash), true)));

  // load existing site profile if any
  const profileRow = db().prepare("SELECT profile_json FROM site_profiles WHERE project_id = ?").get(project.id) as { profile_json: string } | undefined;
  const siteProfile = profileRow ? JSON.parse(profileRow.profile_json) : undefined;

  // analyse each unique page (cheap model)
  const pages: Array<{ url: string; analysis: PageAnalysis }> = [];
  for (const cap of unique) {
    onProgress({ type: "analyze", url: cap.url });
    const trimmed = fs.readFileSync(cap.trimmed_path, "utf8");
    const userPrompt = buildAnalyzeUserPrompt({ url: cap.url, trimmedDom: trimmed });
    let parsed: PageAnalysis;
    let res;
    try {
      const out = await parseLlmJsonWithRetry<PageAnalysis>(
        (r) => callLLM(r, { tier: "cheap", projectId: project.id, purpose: "analyze_page" }),
        {
          system: ANALYZE_SYSTEM,
          cacheable: { system: true },
          messages: [{ role: "user", content: userPrompt }],
          jsonMode: true,
        },
      );
      parsed = PageAnalysisSchema.parse(out.value);
      res = out.res;
    } catch (e: any) {
      onProgress({ type: "fail", message: `analysis failed for ${cap.url}: ${e?.message ?? e}` });
      throw e;
    }
    pages.push({ url: cap.url, analysis: parsed });
    onProgress({ type: "analyze_done", url: cap.url, elements: parsed.elements.length, cached: res.cachedTokens });
  }

  // dedupe page-object names (LLM may return same name twice)
  const seenNames = new Set<string>();
  const pageObjectsByName: Record<string, PageAnalysis> = {};
  const pageUrlByName: Record<string, string> = {};
  for (const p of pages) {
    let name = p.analysis.pageName;
    let i = 2;
    while (seenNames.has(name)) name = `${p.analysis.pageName}${i++}`;
    seenNames.add(name);
    pageObjectsByName[name] = { ...p.analysis, pageName: name };
    pageUrlByName[name] = p.url;
  }

  // generate test plan (default model)
  onProgress({ type: "plan" });
  const planPrompt = buildGenerateUserPrompt({
    rootUrl: project.root_url,
    siteProfile,
    pages: pages.map((p, idx) => ({ url: p.url, analysis: pageObjectsByName[Object.keys(pageObjectsByName)[idx]] })),
  });
  let plan: TestPlan;
  try {
    const out = await parseLlmJsonWithRetry<TestPlan>(
      (r) => callLLM(r, { tier: "default", projectId: project.id, purpose: "generate_plan" }),
      {
        system: GENERATE_SYSTEM,
        cacheable: { system: true },
        messages: [{ role: "user", content: planPrompt }],
        jsonMode: true,
        maxTokens: 6000,
      },
    );
    plan = TestPlanSchema.parse(out.value);
  } catch (e: any) {
    onProgress({ type: "fail", message: `plan failed: ${e?.message ?? e}` });
    throw e;
  }
  onProgress({ type: "plan_done", cases: plan.cases.length });

  // emit
  const outDir = projectOutDir(project.slug);
  // wipe previous emit (regenerate-friendly per the plan; tests aren't versioned in git here)
  fs.rmSync(outDir, { recursive: true, force: true });
  onProgress({ type: "emit", outDir });

  const result = emitProject({
    outDir,
    projectName: project.name,
    projectSlug: project.slug,
    baseURL: project.root_url,
    pageObjectsByName,
    pageUrlByName,
    plan,
  });

  // record tests in DB (replace previous)
  db().transaction(() => {
    db().prepare("DELETE FROM tests WHERE project_id = ?").run(project.id);
    const ins = db().prepare(
      `INSERT INTO tests (project_id, name, file_path, page_object_path, locator_meta_json, page_url, primary_locator_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const t of result.tests) {
      ins.run(project.id, t.name, t.filePath, t.pageObjectPath, JSON.stringify(t.locatorMeta), t.pageUrl, t.primaryLocatorKey);
    }
  })();

  onProgress({ type: "emit_done", tests: result.tests.length, warnings: result.warnings });
  return { outDir, testCount: result.tests.length };
}
