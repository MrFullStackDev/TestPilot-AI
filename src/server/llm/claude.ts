import Anthropic from "@anthropic-ai/sdk";
import type { LLMAdapter, LLMRequest, LLMResponse } from "./types";
import { priceCall } from "@/lib/cost";

export function makeClaudeAdapter(apiKey: string): LLMAdapter {
  const client = new Anthropic({ apiKey });

  return {
    provider: "anthropic",

    async ping(model) {
      try {
        const r = await client.messages.create({
          model,
          max_tokens: 16,
          messages: [{ role: "user", content: "ping" }],
        });
        return { ok: true, model: r.model };
      } catch (e: any) {
        return { ok: false, model, error: e?.message ?? String(e) };
      }
    },

    async complete(req: LLMRequest): Promise<LLMResponse> {
      const systemBlocks = req.system
        ? req.cacheable?.system
          ? [{ type: "text" as const, text: req.system, cache_control: { type: "ephemeral" as const } }]
          : [{ type: "text" as const, text: req.system }]
        : undefined;

      const r = await client.messages.create({
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.2,
        system: systemBlocks,
        messages: req.messages.map((m) => ({ role: m.role === "system" ? "user" : m.role, content: m.content })),
      });

      const text = r.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("");

      const inputTokens = r.usage.input_tokens ?? 0;
      const outputTokens = r.usage.output_tokens ?? 0;
      const cachedTokens = (r.usage as any).cache_read_input_tokens ?? 0;
      const costUsd = priceCall(req.model, inputTokens, outputTokens, cachedTokens);

      return {
        text,
        inputTokens,
        outputTokens,
        cachedTokens,
        costUsd,
        model: req.model,
        provider: "anthropic",
        raw: r,
      };
    },
  };
}
