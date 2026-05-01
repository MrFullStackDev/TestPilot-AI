import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { apiError, apiZodError } from "@/server/util/api-error";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const row = db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as { slug: string } | undefined;
  if (!row) return apiError("not_found", "project not found");
  const path = await import("node:path");
  const fs = await import("node:fs");
  const outDir = path.resolve(process.cwd(), "data", "projects", row.slug);
  return NextResponse.json({ ...row, output_dir: fs.existsSync(outDir) ? outDir : null });
}

const PatchBody = z.object({ name: z.string().min(1).max(100).optional(), framework: z.string().max(40).optional() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) return apiZodError(parsed.error);
  const set: string[] = [];
  const values: Array<string | number> = [];
  if (parsed.data.name) { set.push("name = ?"); values.push(parsed.data.name); }
  if (parsed.data.framework !== undefined) { set.push("framework = ?"); values.push(parsed.data.framework); }
  if (set.length === 0) return NextResponse.json({ ok: true });
  values.push(Number(params.id));
  db().prepare(`UPDATE projects SET ${set.join(", ")} WHERE id = ?`).run(...values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  db().prepare("DELETE FROM projects WHERE id = ?").run(Number(params.id));
  return NextResponse.json({ ok: true });
}
