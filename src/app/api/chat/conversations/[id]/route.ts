import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const conv = db().prepare("SELECT * FROM conversations WHERE id = ?").get(id);
  if (!conv) return NextResponse.json({ error: "not found" }, { status: 404 });
  const messages = db().prepare(
    "SELECT id, role, content, web_results_json, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC"
  ).all(id);
  return NextResponse.json({ conversation: conv, messages });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  db().prepare("DELETE FROM conversations WHERE id = ?").run(Number(params.id));
  return NextResponse.json({ ok: true });
}

const PatchBody = z.object({ title: z.string().min(1) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  db().prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?").run(parsed.data.title, Number(params.id));
  return NextResponse.json({ ok: true });
}
