// Edge middleware: rate-limit /api/*. Edge runtime can't use Node fs, so this
// uses a Map directly (no shared state with the Node-side rate-limit module).
// For a single-user local app the simpler Edge-local cap is fine.
import { NextResponse, type NextRequest } from "next/server";

const buckets = new Map<string, { tokens: number; resetAt: number }>();
const CAPACITY = 120;
const WINDOW_MS = 60_000;

export const config = {
  matcher: ["/api/:path*"],
};

export function middleware(req: NextRequest) {
  // Use forwarded-for if present, else "local". With our 127.0.0.1 bind this is
  // basically a per-process cap; we keep the per-IP shape so a future bind-change
  // doesn't lose limits.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${ip}:${req.nextUrl.pathname.split("/").slice(0, 4).join("/")}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { tokens: CAPACITY - 1, resetAt: now + WINDOW_MS });
    return NextResponse.next();
  }
  if (b.tokens <= 0) {
    return new NextResponse(JSON.stringify({ error: "rate limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(Math.ceil((b.resetAt - now) / 1000)) },
    });
  }
  b.tokens -= 1;
  return NextResponse.next();
}
