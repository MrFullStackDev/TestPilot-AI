import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { getSettings } from "@/server/llm/router";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const total = (db().prepare("SELECT COALESCE(SUM(cost_usd),0) AS spent FROM llm_calls WHERE project_id = ?").get(id) as { spent: number }).spent;
  const byProvider = db().prepare(
    "SELECT provider, model, COUNT(*) AS calls, SUM(input_tokens) AS in_tok, SUM(output_tokens) AS out_tok, SUM(cached_tokens) AS cached, SUM(cost_usd) AS cost FROM llm_calls WHERE project_id = ? GROUP BY provider, model"
  ).all(id);
  const byPurpose = db().prepare(
    "SELECT purpose, COUNT(*) AS calls, SUM(cost_usd) AS cost FROM llm_calls WHERE project_id = ? GROUP BY purpose ORDER BY cost DESC"
  ).all(id);
  const { budget_usd } = getSettings();
  return NextResponse.json({ total, budget: budget_usd, byProvider, byPurpose });
}
