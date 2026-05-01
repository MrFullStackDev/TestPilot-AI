import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pingProvider } from "@/server/llm/router";
import { runWithRequestKeys } from "@/server/llm/request-context";

export const runtime = "nodejs";

const Q = z.enum(["anthropic", "openai", "google"]);

export async function POST(req: NextRequest) {
  const provider = Q.safeParse(req.nextUrl.searchParams.get("provider"));
  if (!provider.success) return NextResponse.json({ ok: false, error: "bad provider" }, { status: 400 });
  try {
    const r = await runWithRequestKeys(req, () => pingProvider(provider.data));
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 });
  }
}
