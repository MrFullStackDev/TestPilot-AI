// Streaming chat. Wraps the existing LLM adapters to stream tokens via SSE.
// Anthropic: native streaming + optional web_search_20250305 tool.
// OpenAI / Gemini: streaming via their own APIs (kept simple).

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/server/db/client";
import { withLock } from "@/server/util/lock";
import { getApiKey, getSettings } from "./router";
import { priceCall } from "@/lib/cost";
import type { Provider } from "./types";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type StreamChunk =
  | { type: "delta"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "web_results"; query: string; results: Array<{ title: string; url: string; snippet?: string }> }
  | { type: "done"; usage: { inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number; model: string; provider: Provider } }
  | { type: "error"; message: string };

export type ChatOptions = {
  provider?: Provider;
  model?: string;
  webSearch?: boolean;
  system?: string;
  conversationId?: number;
};

export async function streamChat(
  history: ChatMessage[],
  opts: ChatOptions,
  onChunk: (c: StreamChunk) => void
): Promise<void> {
  const settings = getSettings();
  const provider = opts.provider ?? settings.default_provider;
  const model = opts.model ?? settings.default_model;
  const apiKey = getApiKey(provider);

  const lockKey = `llm:chat:${opts.conversationId ?? "_"}`;
  await withLock(lockKey, async () => {
    if (provider === "anthropic") return streamAnthropic(history, opts, onChunk, apiKey, model);
    if (provider === "openai")    return streamOpenAI(history, opts, onChunk, apiKey, model);
    return streamGemini(history, opts, onChunk, apiKey, model);
  });
}

// ---- Anthropic ---------------------------------------------------------------

async function streamAnthropic(history: ChatMessage[], opts: ChatOptions, onChunk: (c: StreamChunk) => void, apiKey: string, model: string) {
  const client = new Anthropic({ apiKey });
  const tools = opts.webSearch
    ? [{ type: "web_search_20250305", name: "web_search", max_uses: 5 } as any]
    : undefined;

  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;

  try {
    const stream = await client.messages.stream({
      model,
      max_tokens: 4096,
      temperature: 0.4,
      system: opts.system ? [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }] : undefined,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
      tools,
    } as any);

    stream.on("text", (delta) => { onChunk({ type: "delta", text: delta }); });

    stream.on("contentBlock", (block: any) => {
      if (block.type === "tool_use" && block.name === "web_search") {
        onChunk({ type: "tool_use", name: "web_search", input: block.input });
      }
      // Anthropic surfaces results in subsequent assistant messages with type=web_search_tool_result
      if (block.type === "web_search_tool_result") {
        const content = block.content;
        if (Array.isArray(content)) {
          const results = content
            .filter((c: any) => c?.type === "web_search_result")
            .map((c: any) => ({ title: c.title ?? "", url: c.url ?? "", snippet: c.encrypted_content ? undefined : c.content ?? c.snippet }));
          onChunk({ type: "web_results", query: (block.tool_use_id ?? ""), results });
        }
      }
    });

    const finalMsg = await stream.finalMessage();
    inputTokens = finalMsg.usage.input_tokens ?? 0;
    outputTokens = finalMsg.usage.output_tokens ?? 0;
    cachedTokens = (finalMsg.usage as any).cache_read_input_tokens ?? 0;
  } catch (e: any) {
    onChunk({ type: "error", message: e?.message ?? String(e) });
    return;
  }

  const costUsd = priceCall(model, inputTokens, outputTokens, cachedTokens);
  recordCall("anthropic", model, inputTokens, outputTokens, cachedTokens, costUsd, "chat");
  onChunk({ type: "done", usage: { inputTokens, outputTokens, cachedTokens, costUsd, model, provider: "anthropic" } });
}

// ---- OpenAI ------------------------------------------------------------------

async function streamOpenAI(history: ChatMessage[], opts: ChatOptions, onChunk: (c: StreamChunk) => void, apiKey: string, model: string) {
  const client = new OpenAI({ apiKey });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  for (const m of history) messages.push({ role: m.role, content: m.content });

  let inputTokens = 0; let outputTokens = 0;
  try {
    const stream = await client.chat.completions.create({ model, max_tokens: 4096, temperature: 0.4, messages, stream: true, stream_options: { include_usage: true } });
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) onChunk({ type: "delta", text: delta });
      if ((chunk as any).usage) {
        inputTokens = (chunk as any).usage.prompt_tokens ?? 0;
        outputTokens = (chunk as any).usage.completion_tokens ?? 0;
      }
    }
  } catch (e: any) {
    onChunk({ type: "error", message: e?.message ?? String(e) });
    return;
  }
  const costUsd = priceCall(model, inputTokens, outputTokens, 0);
  recordCall("openai", model, inputTokens, outputTokens, 0, costUsd, "chat");
  onChunk({ type: "done", usage: { inputTokens, outputTokens, cachedTokens: 0, costUsd, model, provider: "openai" } });
}

// ---- Gemini ------------------------------------------------------------------

async function streamGemini(history: ChatMessage[], opts: ChatOptions, onChunk: (c: StreamChunk) => void, apiKey: string, model: string) {
  const client = new GoogleGenerativeAI(apiKey);
  const m = client.getGenerativeModel({
    model,
    systemInstruction: opts.system,
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
  });
  const contents = history.map((msg) => ({ role: msg.role === "assistant" ? "model" : "user", parts: [{ text: msg.content }] }));
  let inputTokens = 0; let outputTokens = 0;
  try {
    const stream = await m.generateContentStream({ contents });
    for await (const chunk of stream.stream) {
      const txt = chunk.text();
      if (txt) onChunk({ type: "delta", text: txt });
    }
    const final = await stream.response;
    const usage = (final as any).usageMetadata ?? {};
    inputTokens = usage.promptTokenCount ?? 0;
    outputTokens = usage.candidatesTokenCount ?? 0;
  } catch (e: any) {
    onChunk({ type: "error", message: e?.message ?? String(e) });
    return;
  }
  const costUsd = priceCall(model, inputTokens, outputTokens, 0);
  recordCall("google", model, inputTokens, outputTokens, 0, costUsd, "chat");
  onChunk({ type: "done", usage: { inputTokens, outputTokens, cachedTokens: 0, costUsd, model, provider: "google" } });
}

function recordCall(provider: Provider, model: string, input: number, output: number, cached: number, cost: number, purpose: string) {
  db().prepare(
    "INSERT INTO llm_calls (project_id, provider, model, input_tokens, output_tokens, cached_tokens, cost_usd, purpose) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)"
  ).run(provider, model, input, output, cached, cost, purpose);
}
