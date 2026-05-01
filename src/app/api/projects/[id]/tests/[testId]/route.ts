import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";

export const runtime = "nodejs";

const Body = z.object({ quarantined: z.boolean().optional() });

export async function PUT(req: NextRequest, { params }: { params: { id: string; testId: string } }) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  if (typeof parsed.data.quarantined === "boolean") {
    db().prepare("UPDATE tests SET quarantined = ? WHERE id = ? AND project_id = ?")
      .run(parsed.data.quarantined ? 1 : 0, Number(params.testId), Number(params.id));
  }
  return NextResponse.json({ ok: true });
}
