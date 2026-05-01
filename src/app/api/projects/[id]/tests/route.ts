import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const rows = db().prepare(
    "SELECT id, name, file_path, page_object_path, flaky_flag, flaky_reason, quarantined FROM tests WHERE project_id = ? ORDER BY name"
  ).all(Number(params.id));
  return NextResponse.json(rows);
}
