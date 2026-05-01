import { NextRequest } from "next/server";
import fs from "node:fs";
import { z } from "zod";
import { db } from "@/server/db/client";
import { capturePage } from "@/server/crawler/capture";
import { snapshotDir, authStatePath } from "@/server/crawler/paths";
import { sseStream } from "@/server/llm/sse";
import { assertPublicUrl } from "@/server/security/ssrf";
import { ssrfPolicy } from "@/server/security/policy";
import { withLock, isLocked } from "@/server/util/lock";
import { startJob, finishJob } from "@/server/jobs/registry";

export const runtime = "nodejs";
export const maxDuration = 600;

const Body = z.object({ pageIds: z.array(z.number()).min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.message }), { status: 400 });

  const project = db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as { id: number; slug: string } | undefined;
  if (!project) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });

  const auth = authStatePath(project.slug);
  const storageStatePath = fs.existsSync(auth) ? auth : null;

  const placeholders = parsed.data.pageIds.map(() => "?").join(",");
  const pages = db().prepare(`SELECT id, url FROM pages WHERE id IN (${placeholders}) AND project_id = ?`)
    .all(...parsed.data.pageIds, id) as Array<{ id: number; url: string }>;

  const lockKey = `project:${id}:crawl`;
  if (isLocked(lockKey)) {
    return new Response(JSON.stringify({ error: "another crawl is already running for this project" }), { status: 409 });
  }

  return sseStream((sink) => withLock(lockKey, async () => {
    const job = startJob("crawl", id);
    sink.send({ type: "start", count: pages.length, jobId: job.id });
    try {
    for (const p of pages) {
      if (job.signal.aborted) { sink.send({ type: "cancelled" }); break; }
      sink.send({ type: "begin", url: p.url });
      try {
        await assertPublicUrl(p.url, ssrfPolicy());

        // dom-hash skip: if a capture from the last 24h already has the new hash, refresh timestamp only.
        const dir = snapshotDir(project.slug, p.url);
        const result = await capturePage({ url: p.url, outDir: dir, storageStatePath });

        const recent = db().prepare(
          `SELECT id, dom_hash FROM page_captures
           WHERE page_id = ? AND captured_at > datetime('now','-1 day')
           ORDER BY captured_at DESC LIMIT 1`
        ).get(p.id) as { id: number; dom_hash: string } | undefined;

        let cached = false;
        if (recent && recent.dom_hash === result.domHash) {
          // unchanged — don't write a new row, just touch the page timestamp
          db().prepare("UPDATE pages SET status = 'captured', captured_at = datetime('now') WHERE id = ?").run(p.id);
          cached = true;
        } else {
          db().transaction(() => {
            db().prepare("UPDATE pages SET status = 'captured', captured_at = datetime('now') WHERE id = ?").run(p.id);
            db().prepare(
              `INSERT INTO page_captures (page_id, dom_path, trimmed_path, a11y_path, screenshot_path, network_path, dom_hash)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(p.id, result.domPath, result.trimmedPath, result.a11yPath, result.screenshotPath, result.networkPath, result.domHash);
          })();
        }

        sink.send({ type: "captured", url: p.url, hash: result.domHash, bytes: result.bytes, cached });
      } catch (e: any) {
        db().prepare("UPDATE pages SET status = 'failed' WHERE id = ?").run(p.id);
        sink.send({ type: "fail", url: p.url, error: e?.message ?? String(e) });
      }
    }

    sink.send({ type: "done" });
    } finally {
      finishJob(job.id, job.status === "cancelled" ? "cancelled" : "done");
    }
  }));
}
