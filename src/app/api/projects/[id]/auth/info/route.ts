import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { db } from "@/server/db/client";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const row = db().prepare("SELECT recorded_at, storage_state_path FROM auth_states WHERE project_id = ?").get(id) as
    | { recorded_at: string; storage_state_path: string }
    | undefined;
  if (!row || !fs.existsSync(row.storage_state_path)) return NextResponse.json({ recorded_at: null, cookies: 0 });
  try {
    const state = JSON.parse(fs.readFileSync(row.storage_state_path, "utf8"));
    return NextResponse.json({ recorded_at: row.recorded_at, cookies: state.cookies?.length ?? 0, origins: state.origins?.length ?? 0 });
  } catch {
    return NextResponse.json({ recorded_at: row.recorded_at, cookies: 0 });
  }
}
