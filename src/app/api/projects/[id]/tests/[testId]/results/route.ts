import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: { id: string; testId: string } }) {
  const rows = db().prepare(
    `SELECT id, status, duration_ms, error, run_id FROM test_results
     WHERE test_id = ? ORDER BY id DESC LIMIT 50`
  ).all(Number(params.testId));
  return NextResponse.json(rows);
}
