export type Provider = "anthropic" | "openai" | "google";
export type Role = "user" | "assistant" | "system";

export type Message = {
  role: Role;
  content: string;
};

export type LLMRequest = {
  model: string;
  system?: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  // Mark a content prefix as cacheable. The adapter chooses how to encode it (Anthropic cache_control, OpenAI auto, Gemini context).
  cacheable?: { system?: boolean };
  jsonMode?: boolean;
  purpose?: string;
};

export type LLMResponse = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  model: string;
  provider: Provider;
  raw?: unknown;
};

export interface LLMAdapter {
  provider: Provider;
  ping(model: string): Promise<{ ok: boolean; model: string; error?: string }>;
  complete(req: LLMRequest): Promise<LLMResponse>;
}
