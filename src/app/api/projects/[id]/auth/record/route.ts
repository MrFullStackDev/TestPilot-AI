import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { recordAuth } from "@/server/crawler/auth-recorder";
import { authStatePath } from "@/server/crawler/paths";
import { assertPublicUrl } from "@/server/security/ssrf";
import { ssrfPolicy } from "@/server/security/policy";

export const runtime = "nodejs";
export const maxDuration = 600;

const Body = z.object({ loginUrl: z.string().url().optional().or(z.literal("")) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const project = db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as { id: number; slug: string; root_url: string } | undefined;
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const target = parsed.data.loginUrl || project.root_url;
  try { await assertPublicUrl(target, ssrfPolicy()); }
  catch (e: any) { return NextResponse.json({ error: `ssrf: ${e?.message}` }, { status: 400 }); }

  const statePath = authStatePath(project.slug);
  try {
    const result = await recordAuth({
      rootUrl: project.root_url,
      loginUrl: parsed.data.loginUrl || undefined,
      storageStatePath: statePath,
    });

    db().prepare(
      `INSERT INTO auth_states (project_id, storage_state_path) VALUES (?, ?)
       ON CONFLICT(project_id) DO UPDATE SET storage_state_path = excluded.storage_state_path, recorded_at = datetime('now')`
    ).run(id, statePath);

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
