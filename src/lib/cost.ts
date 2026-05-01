// Token pricing per million tokens (USD). Approximate, used for budget tracking.
export type Pricing = { input: number; output: number; cachedInput?: number };

export const PRICING: Record<string, Pricing> = {
  // Anthropic
  "claude-opus-4-7": { input: 15, output: 75, cachedInput: 1.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cachedInput: 0.3 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cachedInput: 0.08 },
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10, cachedInput: 1.25 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cachedInput: 0.075 },
  // Google
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-1.5-pro": { input: 1.25, output: 5 },
};

export function priceCall(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0
): number {
  const p = PRICING[model];
  if (!p) return 0;
  const fresh = Math.max(0, inputTokens - cachedTokens);
  const inCost = (fresh * p.input) / 1_000_000;
  const cacheCost = (cachedTokens * (p.cachedInput ?? p.input)) / 1_000_000;
  const outCost = (outputTokens * p.output) / 1_000_000;
  return inCost + cacheCost + outCost;
}

export function formatUSD(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
