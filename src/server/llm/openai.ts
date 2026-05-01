import OpenAI from "openai";
import type { LLMAdapter, LLMRequest, LLMResponse } from "./types";
import { priceCall } from "@/lib/cost";

export function makeOpenAIAdapter(apiKey: string): LLMAdapter {
  const client = new OpenAI({ apiKey });

  return {
    provider: "openai",

    async ping(model) {
      try {
        const r = await client.chat.completions.create({
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
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (req.system) messages.push({ role: "system", content: req.system });
      for (const m of req.messages) messages.push({ role: m.role, content: m.content });

      const r = await client.chat.completions.create({
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.2,
        messages,
        response_format: req.jsonMode ? { type: "json_object" } : undefined,
      });

      const text = r.choices[0]?.message?.content ?? "";
      const inputTokens = r.usage?.prompt_tokens ?? 0;
      const outputTokens = r.usage?.completion_tokens ?? 0;
      const cachedTokens = (r.usage as any)?.prompt_tokens_details?.cached_tokens ?? 0;
      const costUsd = priceCall(req.model, inputTokens, outputTokens, cachedTokens);

      return { text, inputTokens, outputTokens, cachedTokens, costUsd, model: r.model, provider: "openai", raw: r };
    },
  };
}
