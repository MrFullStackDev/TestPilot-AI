// LLM JSON helper: extracts the first JSON object from a model response,
// stripping accidental code fences. Throws if nothing parseable.
//
// `parseLlmJsonWithRetry` automatically asks the model to re-emit valid JSON
// once if the first response fails to parse — drift-tolerant without burning
// budget on repeated retries.

import type { LLMRequest, LLMResponse } from "./types";

export function parseLlmJson<T = unknown>(raw: string): T {
  let s = raw.trim();
  // strip code fences
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // find first { ... last }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in LLM response");
  const slice = s.slice(start, end + 1);
  return JSON.parse(slice) as T;
}

export type LLMCaller = (req: Omit<LLMRequest, "model">) => Promise<LLMResponse>;

// Wraps a one-shot LLM call with one auto-retry on JSON parse failure.
// On the retry the original messages are extended with a corrective turn so
// the model knows exactly what to fix. The original call site doesn't need
// to know retry happened.
export async function parseLlmJsonWithRetry<T = unknown>(
  caller: LLMCaller,
  req: Omit<LLMRequest, "model">,
): Promise<{ value: T; res: LLMResponse }> {
  const first = await caller(req);
  try {
    return { value: parseLlmJson<T>(first.text), res: first };
  } catch (e: any) {
    const followup: Omit<LLMRequest, "model"> = {
      ...req,
      messages: [
        ...req.messages,
        { role: "assistant", content: first.text },
        {
          role: "user",
          content: `Your previous output failed JSON.parse with: ${truncate(e?.message ?? String(e), 240)}. Re-emit ONLY a single valid JSON object that matches the schema. No prose, no code fences.`,
        },
      ],
    };
    const second = await caller(followup);
    return { value: parseLlmJson<T>(second.text), res: second };
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
