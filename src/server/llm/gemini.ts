import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMAdapter, LLMRequest, LLMResponse } from "./types";
import { priceCall } from "@/lib/cost";

export function makeGeminiAdapter(apiKey: string): LLMAdapter {
  const client = new GoogleGenerativeAI(apiKey);

  return {
    provider: "google",

    async ping(model) {
      try {
        const m = client.getGenerativeModel({ model });
        const r = await m.generateContent("ping");
        return { ok: true, model: r.response.candidates ? model : model };
      } catch (e: any) {
        return { ok: false, model, error: e?.message ?? String(e) };
      }
    },

    async complete(req: LLMRequest): Promise<LLMResponse> {
      const m = client.getGenerativeModel({
        model: req.model,
        systemInstruction: req.system,
        generationConfig: {
          temperature: req.temperature ?? 0.2,
          maxOutputTokens: req.maxTokens ?? 4096,
          responseMimeType: req.jsonMode ? "application/json" : "text/plain",
        },
      });

      const contents = req.messages.map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

      const r = await m.generateContent({ contents });
      const text = r.response.text();
      const usage = (r.response as any).usageMetadata ?? {};
      const inputTokens = usage.promptTokenCount ?? 0;
      const outputTokens = usage.candidatesTokenCount ?? 0;
      const cachedTokens = usage.cachedContentTokenCount ?? 0;
      const costUsd = priceCall(req.model, inputTokens, outputTokens, cachedTokens);
      return { text, inputTokens, outputTokens, cachedTokens, costUsd, model: req.model, provider: "google", raw: r };
    },
  };
}
