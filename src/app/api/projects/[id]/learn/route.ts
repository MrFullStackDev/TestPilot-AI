import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { buildSiteProfile } from "@/server/generator/profile";
import { runWithRequestKeys } from "@/server/llm/request-context";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const row = db().prepare("SELECT profile_json, version FROM site_profiles WHERE project_id = ?").get(Number(params.id)) as
    | { profile_json: string; version: number }
    | undefined;
  if (!row) return NextResponse.json({ profile: null, version: 0 });
  return NextResponse.json({ profile: JSON.parse(row.profile_json), version: row.version });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const profile = await runWithRequestKeys(req, () => buildSiteProfile(Number(params.id)));
    return NextResponse.json({ profile });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  db().prepare(
    `INSERT INTO site_profiles (project_id, profile_json) VALUES (?, ?)
     ON CONFLICT(project_id) DO UPDATE SET profile_json = excluded.profile_json, version = version + 1, updated_at = datetime('now')`
  ).run(Number(params.id), JSON.stringify(body));
  return NextResponse.json({ ok: true });
}
