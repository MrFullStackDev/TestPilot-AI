import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const rows = db().prepare(
    `SELECT r.id, r.started_at, r.ended_at, r.status,
       (SELECT COUNT(*) FROM test_results tr WHERE tr.run_id = r.id) AS total,
       (SELECT COUNT(*) FROM test_results tr WHERE tr.run_id = r.id AND tr.status = 'passed') AS pass,
       (SELECT COUNT(*) FROM test_results tr WHERE tr.run_id = r.id AND tr.status = 'failed') AS fail
     FROM runs r WHERE r.project_id = ? ORDER BY r.started_at DESC LIMIT 50`
  ).all(Number(params.id));
  return NextResponse.json(rows);
}
