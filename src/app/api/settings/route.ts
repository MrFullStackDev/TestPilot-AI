import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { getSettings } from "@/server/llm/router";

export const runtime = "nodejs";

// BYOK-only: the server never stores provider keys. Settings here are just
// non-secret defaults: provider, models, budget cap.
function publicView() {
  return getSettings();
}

export async function GET() {
  return NextResponse.json(publicView());
}

const Body = z.object({
  default_provider: z.enum(["anthropic", "openai", "google"]).optional(),
  default_model: z.string().optional(),
  cheap_model: z.string().optional(),
  budget_usd: z.number().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const cur = getSettings();
  const merged = {
    default_provider: parsed.data.default_provider ?? cur.default_provider,
    default_model:    parsed.data.default_model    ?? cur.default_model,
    cheap_model:      parsed.data.cheap_model      ?? cur.cheap_model,
    budget_usd:       parsed.data.budget_usd       ?? cur.budget_usd,
  };
  db().prepare(
    `UPDATE settings SET default_provider=?, default_model=?, cheap_model=?, budget_usd=?, updated_at=datetime('now') WHERE id=1`
  ).run(merged.default_provider, merged.default_model, merged.cheap_model, merged.budget_usd);
  return NextResponse.json(publicView());
}
