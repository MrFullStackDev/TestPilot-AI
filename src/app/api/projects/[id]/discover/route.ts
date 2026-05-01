import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { discoverLinks } from "@/server/crawler/discover";
import { canonicalUrl } from "@/lib/utils";
import { authStatePath } from "@/server/crawler/paths";
import { assertPublicUrl } from "@/server/security/ssrf";
import { ssrfPolicy } from "@/server/security/policy";
import { apiError } from "@/server/util/api-error";
import fs from "node:fs";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const project = db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as { id: number; slug: string; root_url: string } | undefined;
  if (!project) return apiError("not_found", "project not found");

  try { await assertPublicUrl(project.root_url, ssrfPolicy()); }
  catch (e: any) { return apiError("ssrf_blocked", `ssrf: ${e?.message ?? e}`); }

  const auth = authStatePath(project.slug);
  const storageStatePath = fs.existsSync(auth) ? auth : null;

  let urls: string[];
  try {
    urls = await discoverLinks({ rootUrl: project.root_url, storageStatePath, dedupeByTemplate: true });
  } catch (e: any) {
    return apiError("upstream_failed", e?.message ?? String(e));
  }

  const insert = db().prepare("INSERT OR IGNORE INTO pages (project_id, url) VALUES (?, ?)");
  const tx = db().transaction((rows: string[]) => { for (const u of rows) insert.run(id, canonicalUrl(u)); });
  tx(urls);

  return NextResponse.json({ count: urls.length });
}
