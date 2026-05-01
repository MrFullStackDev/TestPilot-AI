import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";

export const runtime = "nodejs";

export async function GET() {
  const rows = db().prepare(
    `SELECT c.id, c.title, c.provider, c.model, c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
     FROM conversations c ORDER BY c.updated_at DESC LIMIT 200`
  ).all();
  return NextResponse.json(rows);
}

const Body = z.object({ title: z.string().optional() });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const title = parsed.success ? parsed.data.title ?? "New conversation" : "New conversation";
  const info = db().prepare("INSERT INTO conversations (title) VALUES (?)").run(title);
  return NextResponse.json({ id: Number(info.lastInsertRowid), title });
}
