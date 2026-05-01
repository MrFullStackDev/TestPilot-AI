import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/server/db/client";
import { sseStream } from "@/server/llm/sse";
import { spawnPlaywright } from "@/server/runner/spawn";
import { parsePlaywrightJson } from "@/server/runner/parse-results";
import { projectOutDir, authStatePath } from "@/server/crawler/paths";
import { startJob, finishJob } from "@/server/jobs/registry";

export const runtime = "nodejs";
export const maxDuration = 1800;

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const project = db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as { id: number; slug: string; root_url: string } | undefined;
  if (!project) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });

  const outDir = projectOutDir(project.slug);
  if (!fs.existsSync(path.join(outDir, "package.json"))) {
    return new Response(JSON.stringify({ error: "project not generated yet" }), { status: 400 });
  }

  return sseStream(async (sink) => {
    // Ensure deps installed
    if (!fs.existsSync(path.join(outDir, "node_modules"))) {
      sink.send({ type: "info", message: "installing playwright deps (first run)…" });
      await new Promise<void>((res, rej) => {
        const { spawn } = require("node:child_process");
        const p = spawn("npm", ["install", "--no-audit", "--no-fund"], { cwd: outDir });
        p.stdout.on("data", (d: Buffer) => sink.send({ type: "stdout", line: d.toString().trimEnd() }));
        p.stderr.on("data", (d: Buffer) => sink.send({ type: "stderr", line: d.toString().trimEnd() }));
        p.on("close", (code: number) => (code === 0 ? res() : rej(new Error(`npm install exited ${code}`))));
      });
    }

    // Insert run row
    const runId = Number(db().prepare("INSERT INTO runs (project_id, status) VALUES (?, 'running')").run(id).lastInsertRowid);
    sink.send({ type: "run_start", runId });

    const reporterPath = path.join(outDir, "playwright-report.json");
    const auth = authStatePath(project.slug);
    const storageStatePath = fs.existsSync(auth) ? auth : null;

    const job = startJob("run", id);
    sink.send({ type: "job_start", jobId: job.id });
    const run = spawnPlaywright({
      outDir,
      reporterJsonPath: reporterPath,
      baseURL: project.root_url,
      storageStatePath,
    });
    job.killHooks.push(() => { try { run.proc.kill("SIGTERM"); } catch {} });

    (async () => { for await (const ln of run.stdout) sink.send({ type: "stdout", line: ln }); })();
    (async () => { for await (const ln of run.stderr) sink.send({ type: "stderr", line: ln }); })();

    const { code } = await run.done;
    finishJob(job.id, code === 0 ? "done" : job.signal.aborted ? "cancelled" : "failed");
    const results = parsePlaywrightJson(reporterPath);

    db().transaction(() => {
      db().prepare(
        "UPDATE runs SET ended_at = datetime('now'), status = ?, raw_output_path = ? WHERE id = ?"
      ).run(code === 0 ? "passed" : "failed", reporterPath, runId);
      const ins = db().prepare(
        "INSERT INTO test_results (run_id, test_id, test_name, status, error, duration_ms) VALUES (?, ?, ?, ?, ?, ?)"
      );
      for (const r of results) {
        const t = db().prepare("SELECT id FROM tests WHERE project_id = ? AND name = ?").get(id, r.test_name) as { id: number } | undefined;
        ins.run(runId, t?.id ?? null, r.test_name, r.status, r.error, r.duration_ms);
      }
    })();

    // recompute flakiness for this project
    const { recomputeFlakiness } = await import("@/server/flakiness/compute");
    recomputeFlakiness(id);

    sink.send({ type: "run_end", runId, code, total: results.length, pass: results.filter((r) => r.status === "passed").length });
  });
}
