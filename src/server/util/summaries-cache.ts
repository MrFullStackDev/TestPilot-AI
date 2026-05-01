// In-process TTL cache for the projects-summaries endpoint. Lives here (and
// not inside the route module) because Next.js disallows non-handler exports
// from `route.ts`. Mutations that affect summary numbers should call
// `invalidateSummariesCache()` to drop the cached snapshot immediately.

let cache: { ts: number; rows: unknown[] } | null = null;
const TTL_MS = 5_000;

export function readSummariesCache(): unknown[] | null {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.rows;
  return null;
}

export function writeSummariesCache(rows: unknown[]) {
  cache = { ts: Date.now(), rows };
}

export function invalidateSummariesCache() {
  cache = null;
}
