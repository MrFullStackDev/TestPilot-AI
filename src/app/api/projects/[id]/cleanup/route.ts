import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db } from "@/server/db/client";

export const runtime = "nodejs";

// Project housekeeping. Idempotent. Defaults are conservative; aggressive
// purge requires the body switch.
const Body = z.object({
  keepRuns: z.number().int().min(1).max(500).default(50),
  capturesPerPage: z.number().int().min(1).max(20).default(5),
  llmCallDays: z.number().int().min(1).max(365).default(30),
  removeSnapshotsForMissingPages: z.boolean().default(true),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const project = db().prepare("SELECT slug FROM projects WHERE id = ?").get(id) as { slug: string } | undefined;
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const opts = parsed.data;

  const before = stats(id);
  const removedFiles: string[] = [];

  // 1. Delete old runs beyond keepRuns
  const keepIds = db().prepare("SELECT id FROM runs WHERE project_id = ? ORDER BY id DESC LIMIT ?").all(id, opts.keepRuns) as Array<{ id: number }>;
  const keepSet = new Set(keepIds.map((r) => r.id));
  const toDeleteRuns = (db().prepare("SELECT id FROM runs WHERE project_id = ?").all(id) as Array<{ id: number }>)
    .filter((r) => !keepSet.has(r.id));
  for (const r of toDeleteRuns) db().prepare("DELETE FROM runs WHERE id = ?").run(r.id);

  // 2. Cap captures per page
  const pages = db().prepare("SELECT id FROM pages WHERE project_id = ?").all(id) as Array<{ id: number }>;
  for (const p of pages) {
    const oldCaptures = db().prepare(
      `SELECT id, dom_path, trimmed_path, a11y_path, screenshot_path, network_path FROM page_captures
       WHERE page_id = ? ORDER BY captured_at DESC LIMIT -1 OFFSET ?`
    ).all(p.id, opts.capturesPerPage) as Array<{ id: number; dom_path: string; trimmed_path: string; a11y_path: string; screenshot_path: string; network_path: string }>;
    for (const c of oldCaptures) {
      for (const f of [c.dom_path, c.trimmed_path, c.a11y_path, c.screenshot_path, c.network_path]) {
        if (f && fs.existsSync(f)) { fs.unlinkSync(f); removedFiles.push(f); }
      }
      db().prepare("DELETE FROM page_captures WHERE id = ?").run(c.id);
    }
  }

  // 3. Old llm_calls
  db().prepare("DELETE FROM llm_calls WHERE project_id = ? AND created_at < datetime('now', ?)").run(id, `-${opts.llmCallDays} days`);

  // 4. Snapshot dir cleanup — files referenced by no current capture
  const snapshotsDir = path.resolve(process.cwd(), "data", "snapshots", project.slug);
  if (fs.existsSync(snapshotsDir) && opts.removeSnapshotsForMissingPages) {
    const validPaths = new Set<string>();
    const all = db().prepare(
      `SELECT pc.dom_path, pc.trimmed_path, pc.a11y_path, pc.screenshot_path, pc.network_path
       FROM page_captures pc JOIN pages p ON p.id = pc.page_id WHERE p.project_id = ?`
    ).all(id) as Array<{ dom_path: string; trimmed_path: string; a11y_path: string; screenshot_path: string; network_path: string }>;
    for (const r of all) {
      for (const f of [r.dom_path, r.trimmed_path, r.a11y_path, r.screenshot_path, r.network_path]) {
        if (f) validPaths.add(path.resolve(f));
      }
    }
    walkAndRemove(snapshotsDir, validPaths, removedFiles);
  }

  const after = stats(id);
  return NextResponse.json({ before, after, removedFiles: removedFiles.length });
}

function stats(id: number) {
  return {
    runs: (db().prepare("SELECT COUNT(*) AS c FROM runs WHERE project_id = ?").get(id) as { c: number }).c,
    captures: (db().prepare("SELECT COUNT(*) AS c FROM page_captures pc JOIN pages p ON p.id = pc.page_id WHERE p.project_id = ?").get(id) as { c: number }).c,
    llm_calls: (db().prepare("SELECT COUNT(*) AS c FROM llm_calls WHERE project_id = ?").get(id) as { c: number }).c,
  };
}

function walkAndRemove(dir: string, valid: Set<string>, removed: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAndRemove(full, valid, removed);
      try { if (fs.readdirSync(full).length === 0) fs.rmdirSync(full); } catch {}
    } else {
      // keep auth state file and any path referenced by a capture
      if (entry.name === "state.json") continue;
      if (valid.has(path.resolve(full))) continue;
      try { fs.unlinkSync(full); removed.push(full); } catch {}
    }
  }
}
