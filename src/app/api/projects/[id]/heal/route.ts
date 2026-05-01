import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { healTestResult } from "@/server/healer/heal";
import { applyHeal } from "@/server/healer/apply";
import { runWithRequestKeys } from "@/server/llm/request-context";

export const runtime = "nodejs";
export const maxDuration = 300;

const PostBody = z.object({ testId: z.number().describe("test_results.id") });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = PostBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  const out = await runWithRequestKeys(req, () =>
    healTestResult({ projectId: Number(params.id), testResultId: parsed.data.testId })
  );
  if (!out.ok) return NextResponse.json({ ok: false, error: out.reason });
  return NextResponse.json({ ok: true, eventId: out.eventId, method: out.method, old: out.old, new: out.new, rationale: out.rationale });
}

const PutBody = z.object({ eventId: z.number(), action: z.enum(["accept", "reject"]) });

export async function PUT(req: NextRequest, { params: _ }: { params: { id: string } }) {
  const parsed = PutBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  if (parsed.data.action === "reject") {
    db().prepare("DELETE FROM heal_events WHERE id = ?").run(parsed.data.eventId);
    return NextResponse.json({ ok: true });
  }
  const r = applyHeal(parsed.data.eventId);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const rows = db().prepare(
    `SELECT he.id, he.old_locator, he.new_locator, he.rationale, he.accepted, he.created_at, he.test_id, t.name AS test_name
     FROM heal_events he LEFT JOIN tests t ON t.id = he.test_id
     WHERE t.project_id = ? ORDER BY he.created_at DESC LIMIT 100`
  ).all(Number(params.id));
  return NextResponse.json(rows);
}
