import fs from "node:fs";
import path from "node:path";
import { db } from "@/server/db/client";
import { newContext } from "@/server/crawler/browser-pool";
import { trimDom } from "@/server/crawler/dom-trim";
import { callLLM } from "@/server/llm/router";
import { parseLlmJsonWithRetry } from "@/server/llm/json";
import { HEAL_SYSTEM, buildHealUserPrompt, HealProposalSchema, type HealProposal } from "@/server/llm/prompts/heal";
import { classifyFailure } from "./classify";
import { identifyFailingKey } from "./identify";
import { projectOutDir, authStatePath } from "@/server/crawler/paths";

type LocatorMeta = Record<string, Array<{ strategy: string; value: string }>>;

export type HealOutcome =
  | { ok: true; eventId: number; method: "fast" | "llm"; oldKey: string; old: any; new: any; rationale: string }
  | { ok: false; reason: string };

// Heal a failed test result.
// 1. Classify failure: only "locator" / "timeout" are eligible.
// 2. Identify the failing locator key by parsing the error (getByX('...') calls).
//    Fall back to tests.primary_locator_key.
// 3. Navigate to tests.page_url (the test's actual page) — NOT root_url — so the
//    DOM we evaluate against is the page where the locator was used.
// 4. Fast path: try existing fallback candidates; one that resolves uniquely wins.
// 5. Slow path: cheap LLM with current trimmed DOM. Verify proposal headlessly.
// 6. Save proposal as a heal_event; never auto-applies.
export async function healTestResult(args: { projectId: number; testResultId: number }): Promise<HealOutcome> {
  const r = db().prepare(
    `SELECT tr.*, t.id AS test_id, t.name AS test_name, t.locator_meta_json,
            t.file_path, t.page_url, t.primary_locator_key
     FROM test_results tr LEFT JOIN tests t ON t.id = tr.test_id
     WHERE tr.id = ? AND t.project_id = ?`
  ).get(args.testResultId, args.projectId) as
    | {
        id: number; test_id: number | null; test_name: string;
        status: string; error: string | null; run_id: number;
        locator_meta_json: string | null; file_path: string | null;
        page_url: string | null; primary_locator_key: string | null;
      }
    | undefined;
  if (!r) return { ok: false, reason: "result not found" };
  if (r.status !== "failed") return { ok: false, reason: "result is not failed" };

  const kind = classifyFailure(r.error);
  if (kind !== "locator" && kind !== "timeout") {
    return { ok: false, reason: `failure kind '${kind}' is not heal-eligible` };
  }
  if (!r.test_id || !r.locator_meta_json) return { ok: false, reason: "no locator metadata for test" };

  const meta = JSON.parse(r.locator_meta_json) as LocatorMeta;
  const pickedKey = identifyFailingKey(r.error, meta, r.primary_locator_key);
  if (!pickedKey || !meta[pickedKey]) return { ok: false, reason: "could not identify failing locator" };

  const oldCandidate = meta[pickedKey][0];
  if (!oldCandidate) return { ok: false, reason: "no candidates for failing key" };

  const project = db().prepare("SELECT slug, root_url FROM projects WHERE id = ?").get(args.projectId) as { slug: string; root_url: string };
  const auth = authStatePath(project.slug);
  const storageStatePath = fs.existsSync(auth) ? auth : null;

  // page-objects.json for intent
  const poJsonPath = path.join(projectOutDir(project.slug), ".testgen/page-objects.json");
  let intent = "Element matching this test step";
  if (fs.existsSync(poJsonPath)) {
    try {
      const pos = JSON.parse(fs.readFileSync(poJsonPath, "utf8"));
      const [poName, alias] = pickedKey.split(".");
      const el = pos[poName]?.elements?.find((e: any) => e.alias === alias);
      if (el?.purpose) intent = el.purpose;
    } catch {}
  }

  // Navigate to the test's actual page — the URL the test step ran on.
  const navUrl = absoluteUrl(r.page_url, project.root_url);

  const ctx = await newContext({ storageStatePath });
  try {
    const page = await ctx.newPage();
    await page.goto(navUrl, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});

    // Fast path
    for (const cand of meta[pickedKey]) {
      if (cand.strategy === oldCandidate.strategy && cand.value === oldCandidate.value) continue;
      const matches = await tryLocator(page, cand).catch(() => 0);
      if (matches === 1) {
        return await record({ ...args, fast: true, key: pickedKey, old: oldCandidate, neu: cand, rationale: `fallback candidate (${cand.strategy}) resolves uniquely` });
      }
    }

    // Slow path
    const html = await page.content();
    const trimmed = trimDom(html);
    const userPrompt = buildHealUserPrompt({
      intent,
      oldStrategy: oldCandidate.strategy,
      oldValue: oldCandidate.value,
      trimmedDom: trimmed,
    });
    let proposal: HealProposal;
    try {
      const out = await parseLlmJsonWithRetry(
        (r) => callLLM(r, { tier: "cheap", projectId: args.projectId, purpose: "heal_locator" }),
        { system: HEAL_SYSTEM, cacheable: { system: true }, messages: [{ role: "user", content: userPrompt }], jsonMode: true },
      );
      proposal = HealProposalSchema.parse(out.value);
    } catch (e: any) {
      return { ok: false, reason: `bad heal JSON: ${e?.message ?? e}` };
    }

    const matches = await tryLocator(page, proposal.newLocator).catch(() => 0);
    if (matches !== 1) return { ok: false, reason: `LLM proposal resolves ${matches} elements, expected 1` };

    return await record({
      ...args, fast: false, key: pickedKey, old: oldCandidate, neu: proposal.newLocator, rationale: proposal.rationale,
    });
  } finally {
    await ctx.close();
  }
}

function absoluteUrl(maybeRelative: string | null, base: string): string {
  if (!maybeRelative) return base;
  try { return new URL(maybeRelative, base).toString(); } catch { return base; }
}

async function tryLocator(page: any, cand: { strategy: string; value: string }): Promise<number> {
  const v = cand.value;
  let loc;
  switch (cand.strategy) {
    case "testid":      loc = page.getByTestId(v); break;
    case "role": {
      const m = v.match(/^([a-zA-Z]+)(?:\s+name=(.+))?$/);
      loc = m ? page.getByRole(m[1], m[2] ? { name: m[2].replace(/^['"]|['"]$/g, "") } : undefined) : page.locator(v);
      break;
    }
    case "label":       loc = page.getByLabel(v); break;
    case "placeholder": loc = page.getByPlaceholder(v); break;
    case "text":        loc = page.getByText(v, { exact: false }); break;
    case "css":         loc = page.locator(v); break;
    case "xpath":       loc = page.locator("xpath=" + v); break;
    default:            loc = page.locator(v);
  }
  return loc.count();
}

async function record(args: {
  projectId: number; testResultId: number; fast: boolean;
  key: string; old: any; neu: any; rationale: string;
}): Promise<HealOutcome> {
  const r = db().prepare("SELECT test_id, run_id FROM test_results WHERE id = ?").get(args.testResultId) as { test_id: number | null; run_id: number };
  const info = db().prepare(
    `INSERT INTO heal_events (test_id, run_id, old_locator, new_locator, rationale, accepted)
     VALUES (?, ?, ?, ?, ?, 0)`
  ).run(r.test_id, r.run_id, JSON.stringify({ key: args.key, ...args.old }), JSON.stringify({ key: args.key, ...args.neu }), args.rationale);
  return { ok: true, eventId: Number(info.lastInsertRowid), method: args.fast ? "fast" : "llm", oldKey: args.key, old: args.old, new: args.neu, rationale: args.rationale };
}
