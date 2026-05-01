import { NextRequest } from "next/server";
import { z } from "zod";
import { sseStream } from "@/server/llm/sse";
import { generateProject } from "@/server/generator/generate";
import { startJob, finishJob } from "@/server/jobs/registry";
import { runWithRequestKeys } from "@/server/llm/request-context";

export const runtime = "nodejs";
export const maxDuration = 600;

const Body = z.object({ pageIds: z.array(z.number()).min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.message }), { status: 400 });

  return sseStream((sink) => runWithRequestKeys(req, async () => {
    const job = startJob("generate", id);
    sink.send({ type: "start", jobId: job.id });
    try {
      const result = await generateProject(id, parsed.data.pageIds, (p) => {
        if (job.signal.aborted) throw new Error("cancelled");
        sink.send({
          type: p.type,
          message: messageFor(p),
          ...("url" in p ? { url: p.url } : {}),
        });
      });
      sink.send({ type: "ok", testCount: result?.testCount ?? 0, outDir: result?.outDir });
      finishJob(job.id, "done");
    } catch (e: any) {
      const cancelled = job.signal.aborted;
      sink.send({ type: cancelled ? "cancelled" : "error", message: e?.message ?? String(e) });
      finishJob(job.id, cancelled ? "cancelled" : "failed");
    }
  }));
}

function messageFor(p: any): string {
  switch (p.type) {
    case "analyze": return `analysing ${p.url}`;
    case "analyze_done": return `${p.elements} elements, ${p.cached} cached tokens`;
    case "plan": return "planning tests";
    case "plan_done": return `${p.cases} cases planned`;
    case "emit": return `writing ${p.outDir}`;
    case "emit_done": return `${p.tests} tests written` + (p.warnings?.length ? `, ${p.warnings.length} warnings` : "");
    case "fail": return p.message;
    default: return "";
  }
}
