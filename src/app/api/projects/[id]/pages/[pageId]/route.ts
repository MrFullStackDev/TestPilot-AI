import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";

export const runtime = "nodejs";

export async function DELETE(_: NextRequest, { params }: { params: { id: string; pageId: string } }) {
  db().prepare("DELETE FROM pages WHERE id = ? AND project_id = ?").run(Number(params.pageId), Number(params.id));
  return NextResponse.json({ ok: true });
}
