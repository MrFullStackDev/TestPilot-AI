import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: { id: string; runId: string } }) {
  const runId = Number(params.runId);
  const run = db().prepare(
    `SELECT r.id, r.started_at, r.ended_at, r.status,
       (SELECT COUNT(*) FROM test_results tr WHERE tr.run_id = r.id) AS total,
       (SELECT COUNT(*) FROM test_results tr WHERE tr.run_id = r.id AND tr.status = 'passed') AS pass,
       (SELECT COUNT(*) FROM test_results tr WHERE tr.run_id = r.id AND tr.status = 'failed') AS fail
     FROM runs r WHERE r.id = ? AND r.project_id = ?`
  ).get(runId, Number(params.id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const results = db().prepare(
    "SELECT id, test_name, test_id, status, error, duration_ms FROM test_results WHERE run_id = ? ORDER BY id"
  ).all(runId);
  return NextResponse.json({ run, results });
}
