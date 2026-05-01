// Token-bucket rate limiter, in-memory. One bucket per (key, windowSeconds).
// Defaults: 60 requests / 60 seconds for /api/* — generous for a personal tool,
// keeps runaway code from accidentally DOS'ing yourself.

type Bucket = { tokens: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type LimitOptions = {
  key: string;
  capacity?: number; // default 60
  windowMs?: number; // default 60_000
};

export function checkRate(opts: LimitOptions): { ok: true; remaining: number; resetAt: number } | { ok: false; resetAt: number } {
  const capacity = opts.capacity ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();
  const b = buckets.get(opts.key);
  if (!b || now >= b.resetAt) {
    const fresh = { tokens: capacity - 1, resetAt: now + windowMs };
    buckets.set(opts.key, fresh);
    return { ok: true, remaining: fresh.tokens, resetAt: fresh.resetAt };
  }
  if (b.tokens <= 0) return { ok: false, resetAt: b.resetAt };
  b.tokens -= 1;
  return { ok: true, remaining: b.tokens, resetAt: b.resetAt };
}
