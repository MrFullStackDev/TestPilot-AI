import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { canonicalUrl } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const onlyCaptured = req.nextUrl.searchParams.get("captured") === "1";
  const q = req.nextUrl.searchParams.get("q");

  if (onlyCaptured) {
    const rows = db().prepare(
      `SELECT p.id, p.url, p.status, pc.id as capture_id
       FROM pages p
       JOIN page_captures pc ON pc.page_id = p.id
       WHERE p.project_id = ?
       ORDER BY pc.captured_at DESC`
    ).all(id);
    return NextResponse.json(rows);
  }

  if (q) {
    const rows = db().prepare(
      "SELECT id, url, status FROM pages WHERE project_id = ? AND url LIKE ? ORDER BY url"
    ).all(id, `%${q}%`);
    return NextResponse.json(rows);
  }

  const rows = db().prepare("SELECT id, url, status FROM pages WHERE project_id = ? ORDER BY url").all(id);
  return NextResponse.json(rows);
}

const PostBody = z.object({ url: z.string().url() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const parsed = PostBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const project = db().prepare("SELECT root_url FROM projects WHERE id = ?").get(id) as { root_url: string } | undefined;
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  let host: string;
  try { host = new URL(project.root_url).origin; }
  catch { return NextResponse.json({ error: "project root URL is invalid" }, { status: 400 }); }
  let inputOrigin: string;
  try { inputOrigin = new URL(parsed.data.url).origin; }
  catch { return NextResponse.json({ error: "invalid url" }, { status: 400 }); }
  if (host !== inputOrigin) return NextResponse.json({ error: `URL must be same origin as ${host}` }, { status: 400 });

  const url = canonicalUrl(parsed.data.url);
  db().prepare("INSERT OR IGNORE INTO pages (project_id, url) VALUES (?, ?)").run(id, url);
  const row = db().prepare("SELECT id, url, status FROM pages WHERE project_id = ? AND url = ?").get(id, url);
  return NextResponse.json(row);
}
