// Build a site profile from existing captures (passive observation + LLM).
import fs from "node:fs";
import { db } from "@/server/db/client";
import { callLLM } from "@/server/llm/router";
import { parseLlmJsonWithRetry } from "@/server/llm/json";
import { PROFILE_SYSTEM, buildProfileUserPrompt, SiteProfileSchema, type SiteProfile } from "@/server/llm/prompts/buildProfile";

export async function buildSiteProfile(projectId: number): Promise<SiteProfile> {
  const project = db().prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as { id: number; root_url: string } | undefined;
  if (!project) throw new Error("project not found");

  const captures = db().prepare(
    `SELECT p.url, pc.dom_path, pc.trimmed_path
     FROM page_captures pc JOIN pages p ON p.id = pc.page_id
     WHERE p.project_id = ? ORDER BY pc.captured_at DESC LIMIT 10`
  ).all(projectId) as Array<{ url: string; dom_path: string; trimmed_path: string }>;
  if (captures.length === 0) throw new Error("no captures yet — crawl first");

  const observations = passiveObservations(captures);
  const sample = fs.readFileSync(captures[0].trimmed_path, "utf8");

  const userPrompt = buildProfileUserPrompt({
    rootUrl: project.root_url,
    observations,
    sampleTrimmedDom: sample,
  });

  const out = await parseLlmJsonWithRetry(
    (r) => callLLM(r, { tier: "cheap", projectId, purpose: "build_profile" }),
    {
      system: PROFILE_SYSTEM,
      cacheable: { system: true },
      messages: [{ role: "user", content: userPrompt }],
      jsonMode: true,
    },
  );
  const profile = SiteProfileSchema.parse(out.value);

  db().prepare(
    `INSERT INTO site_profiles (project_id, profile_json) VALUES (?, ?)
     ON CONFLICT(project_id) DO UPDATE SET profile_json = excluded.profile_json, version = version + 1, updated_at = datetime('now')`
  ).run(projectId, JSON.stringify(profile));

  return profile;
}

function passiveObservations(captures: Array<{ url: string; dom_path: string }>) {
  const selectorCounts: Record<string, number> = {
    "data-testid": 0,
    "data-test": 0,
    "aria-label": 0,
    role: 0,
    id: 0,
    "class-only": 0,
  };
  const scriptHints: Set<string> = new Set();
  const samplePagePaths: string[] = [];
  const samplePageTitles: string[] = [];

  for (const c of captures.slice(0, 5)) {
    let html = "";
    try { html = fs.readFileSync(c.dom_path, "utf8"); } catch { continue; }

    selectorCounts["data-testid"] += matchCount(html, /\sdata-testid=/g);
    selectorCounts["data-test"]   += matchCount(html, /\sdata-test=/g);
    selectorCounts["aria-label"]  += matchCount(html, /\saria-label=/g);
    selectorCounts.role           += matchCount(html, /\srole=/g);
    selectorCounts.id             += matchCount(html, /\sid=/g);

    if (/__next/i.test(html)) scriptHints.add("next");
    if (/_nuxt/i.test(html))  scriptHints.add("nuxt");
    if (/data-reactroot|react-dom/i.test(html)) scriptHints.add("react");
    if (/ng-version=|angular/i.test(html)) scriptHints.add("angular");
    if (/data-v-[a-f0-9]+|vue/i.test(html)) scriptHints.add("vue");
    if (/svelte-/i.test(html)) scriptHints.add("svelte");

    try {
      const u = new URL(c.url);
      samplePagePaths.push(u.pathname || "/");
    } catch {}
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    if (title) samplePageTitles.push(title.trim().slice(0, 80));
  }

  return {
    selectorCounts,
    scriptHints: Array.from(scriptHints),
    samplePagePaths,
    samplePageTitles,
  };
}

function matchCount(s: string, re: RegExp): number {
  return (s.match(re) || []).length;
}
