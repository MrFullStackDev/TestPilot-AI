import { db } from "@/server/db/client";
import { withLock } from "@/server/util/lock";
import { getRequestKey } from "./request-context";
import type { LLMAdapter, LLMRequest, LLMResponse, Provider } from "./types";
import { makeClaudeAdapter } from "./claude";
import { makeOpenAIAdapter } from "./openai";
import { makeGeminiAdapter } from "./gemini";

type SettingsRow = {
  default_provider: Provider;
  default_model: string;
  cheap_model: string;
  budget_usd: number;
};

export function getSettings() {
  return db().prepare(
    "SELECT default_provider, default_model, cheap_model, budget_usd FROM settings WHERE id = 1"
  ).get() as SettingsRow;
}

// Keys are BYOK only: per-request header → process.env fallback (for CLI / tests).
// Nothing is read or stored on the server's disk for provider keys.
export function getApiKey(provider: Provider): string {
  const fromRequest = getRequestKey(provider);
  if (fromRequest) return fromRequest;
  const k = process.env[envName(provider)];
  if (!k) throw new Error(`No API key for ${provider}. Paste it on the Settings page (it stays in your browser).`);
  return k;
}

function envName(p: Provider): string {
  return p === "anthropic" ? "ANTHROPIC_API_KEY" : p === "openai" ? "OPENAI_API_KEY" : "GOOGLE_GENERATIVE_AI_API_KEY";
}

export function makeAdapter(provider: Provider, apiKey: string): LLMAdapter {
  switch (provider) {
    case "anthropic": return makeClaudeAdapter(apiKey);
    case "openai":    return makeOpenAIAdapter(apiKey);
    case "google":    return makeGeminiAdapter(apiKey);
  }
}

export type CallOptions = {
  provider?: Provider;
  model?: string;
  tier?: "default" | "cheap";
  projectId?: number;
  purpose: string;
  // Per-call deadline. Default 60s; override for slow flows (deep reasoning).
  // We race the adapter promise against this — if it loses, we throw.
  timeoutMs?: number;
};

const DEFAULT_LLM_TIMEOUT_MS = 60_000;

export async function callLLM(req: Omit<LLMRequest, "model">, opts: CallOptions): Promise<LLMResponse> {
  const settings = getSettings();
  const provider = opts.provider ?? settings.default_provider;
  const model = opts.model ?? (opts.tier === "cheap" ? settings.cheap_model : settings.default_model);
  const apiKey = getApiKey(provider);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;

  // Per-scope serialisation closes the SELECT/INSERT race.  Concurrent calls
  // on the same project (or globally for project-less calls) queue rather than
  // both passing the budget check at the same instant.
  const lockKey = `llm:${opts.projectId ?? "_global"}`;
  return withLock(lockKey, async () => {
    assertBudget(opts.projectId);

    // Reserve a worst-case slot BEFORE making the network call. The estimate
    // uses the model's "input" rate × max tokens; we replace it with actuals
    // on success in a single transaction so a crash between the adapter call
    // and the UPDATE can't leave an inflated reservation.
    const reservedCost = estimateMaxCost(model, req.maxTokens ?? 4096);
    const reservationId = Number(
      db().prepare(
        "INSERT INTO llm_calls (project_id, provider, model, input_tokens, output_tokens, cached_tokens, cost_usd, purpose) VALUES (?, ?, ?, 0, 0, 0, ?, ?)"
      ).run(opts.projectId ?? null, provider, model, reservedCost, `${opts.purpose}:reserved`).lastInsertRowid
    );

    let res: LLMResponse;
    try {
      const adapter = makeAdapter(provider, apiKey);
      res = await raceWithTimeout(
        adapter.complete({ ...req, model, purpose: opts.purpose }),
        timeoutMs,
        `LLM call timed out after ${timeoutMs}ms (provider=${provider}, model=${model}, purpose=${opts.purpose})`,
      );
    } catch (e) {
      db().prepare("DELETE FROM llm_calls WHERE id = ?").run(reservationId);
      throw e;
    }

    // Replace the reservation with the actuals atomically.
    db().prepare(
      "UPDATE llm_calls SET input_tokens = ?, output_tokens = ?, cached_tokens = ?, cost_usd = ?, purpose = ? WHERE id = ?"
    ).run(res.inputTokens, res.outputTokens, res.cachedTokens, res.costUsd, opts.purpose, reservationId);

    return res;
  });
}

function raceWithTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

function assertBudget(projectId?: number) {
  const { budget_usd } = getSettings();
  if (!budget_usd || budget_usd <= 0) return;
  const row = projectId
    ? (db().prepare("SELECT COALESCE(SUM(cost_usd),0) AS spent FROM llm_calls WHERE project_id = ?").get(projectId) as { spent: number })
    : (db().prepare("SELECT COALESCE(SUM(cost_usd),0) AS spent FROM llm_calls").get() as { spent: number });
  if (row.spent >= budget_usd) {
    throw new Error(`Budget exceeded: spent $${row.spent.toFixed(2)} of $${budget_usd}`);
  }
}

// Called once at process startup. Reservations from crashed prior runs would
// otherwise count against the budget forever. We treat any `:reserved` row
// older than 10 minutes (longer than any reasonable LLM call) as orphaned.
export function sweepOrphanedReservations() {
  try {
    db().prepare(
      "DELETE FROM llm_calls WHERE purpose LIKE '%:reserved' AND created_at < datetime('now', '-10 minutes')"
    ).run();
  } catch {
    // Table may not yet exist on the very first startup; ignore.
  }
}

function estimateMaxCost(model: string, maxOutputTokens: number): number {
  // Use the input price as a stand-in (we don't know real input tokens yet) plus
  // the output ceiling. Intentionally pessimistic — we want the reservation to
  // *over*-count against the budget.
  // Lazy import to avoid a circular dep at module init.
  const { PRICING } = require("@/lib/cost") as typeof import("@/lib/cost");
  const p = PRICING[model];
  if (!p) return 0.05;
  const inGuess = (8000 * p.input) / 1_000_000;
  const outGuess = (maxOutputTokens * p.output) / 1_000_000;
  return inGuess + outGuess;
}

export async function pingProvider(provider: Provider): Promise<{ ok: boolean; model: string; error?: string }> {
  const { default_model, cheap_model } = getSettings();
  const model = provider === "anthropic" && default_model.startsWith("claude") ? default_model
    : provider === "openai"  ? "gpt-4o-mini"
    : provider === "google"  ? "gemini-2.0-flash"
    : cheap_model;
  const apiKey = getApiKey(provider);
  const adapter = makeAdapter(provider, apiKey);
  return adapter.ping(model);
}
