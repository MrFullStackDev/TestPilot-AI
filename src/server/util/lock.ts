// Tiny per-key async lock. In-memory only — fine for a single-process Next.js
// dev server. Used to serialise LLM budget checks and per-project mutating jobs.

const tails = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const me = new Promise<void>((r) => (release = r));
  const myTail: Promise<unknown> = prev.then(() => me);
  tails.set(key, myTail);
  try {
    await prev.catch(() => {});
    return await fn();
  } finally {
    release();
    if (tails.get(key) === myTail) tails.delete(key);
  }
}

// Returns true when an in-flight lock currently holds the key.
export function isLocked(key: string): boolean {
  return tails.has(key);
}
