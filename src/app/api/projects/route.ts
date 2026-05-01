import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { slugify } from "@/lib/utils";
import { apiZodError } from "@/server/util/api-error";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).max(100),
  rootUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return apiZodError(parsed.error);
  const { name, rootUrl } = parsed.data;

  const baseSlug = slugify(name) || slugify(rootUrl);
  let slug = baseSlug;
  let n = 1;
  while (db().prepare("SELECT 1 FROM projects WHERE slug = ?").get(slug)) {
    n += 1;
    slug = `${baseSlug}-${n}`;
  }

  const info = db()
    .prepare("INSERT INTO projects (slug, name, root_url) VALUES (?, ?, ?)")
    .run(slug, name, rootUrl);

  return NextResponse.json({ id: Number(info.lastInsertRowid), slug });
}

export async function GET() {
  const rows = db().prepare("SELECT * FROM projects ORDER BY created_at DESC").all();
  return NextResponse.json(rows);
}
