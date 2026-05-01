import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";

export const runtime = "nodejs";

// Last 10 activity events across runs, heals, and captures.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const runs = db().prepare(
    `SELECT r.id, r.started_at AS at, r.status,
       (SELECT COUNT(*) FROM test_results tr WHERE tr.run_id = r.id AND tr.status = 'passed') AS pass,
       (SELECT COUNT(*) FROM test_results tr WHERE tr.run_id = r.id) AS total
     FROM runs r WHERE r.project_id = ? ORDER BY r.id DESC LIMIT 5`
  ).all(id) as Array<{ id: number; at: string; status: string; pass: number; total: number }>;

  const heals = db().prepare(
    `SELECT he.id, he.created_at AS at, he.accepted FROM heal_events he
     JOIN tests t ON t.id = he.test_id
     WHERE t.project_id = ? ORDER BY he.id DESC LIMIT 5`
  ).all(id) as Array<{ id: number; at: string; accepted: number }>;

  const caps = db().prepare(
    `SELECT pc.id AS pageId, pc.captured_at AS at, p.url FROM page_captures pc
     JOIN pages p ON p.id = pc.page_id
     WHERE p.project_id = ? ORDER BY pc.id DESC LIMIT 5`
  ).all(id) as Array<{ pageId: number; at: string; url: string }>;

  const merged = [
    ...runs.map((r) => ({ kind: "run" as const, ...r })),
    ...heals.map((h) => ({ kind: "heal" as const, ...h })),
    ...caps.map((c) => ({ kind: "capture" as const, ...c })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 10);

  return NextResponse.json(merged);
}
