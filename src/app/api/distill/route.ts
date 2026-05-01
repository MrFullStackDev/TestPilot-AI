import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trimDom } from "@/server/crawler/dom-trim";

export const runtime = "nodejs";

const Body = z.object({
  html: z.string().min(1).max(10 * 1024 * 1024),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const trimmed = trimDom(parsed.data.html);
  return NextResponse.json({
    trimmed,
    bytes: { input: Buffer.byteLength(parsed.data.html), output: Buffer.byteLength(trimmed) },
  });
}
