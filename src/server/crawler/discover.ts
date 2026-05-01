import { newContext } from "./browser-pool";
import { canonicalUrl } from "@/lib/utils";

export type DiscoverOptions = {
  rootUrl: string;
  storageStatePath?: string | null;
  maxLinks?: number;
  // When true, collapses URLs that share a path template (e.g. /posts/1, /posts/2)
  // to a single representative — avoids burning crawl budget on near-duplicates.
  dedupeByTemplate?: boolean;
};

// Replace numeric path segments and obvious uuid/hash segments with placeholders
// so URLs that differ only by IDs canonicalise to the same template. Keeps the
// query string off the template since queries usually parameterise the same view.
export function urlTemplate(u: string): string {
  try {
    const url = new URL(u);
    const path = url.pathname.replace(/\/(\d+|[0-9a-f]{8,}|[0-9a-fA-F-]{16,})(?=\/|$)/g, "/:id");
    return `${url.origin}${path}`;
  } catch {
    return u;
  }
}

// Shallow URL discovery. Strategies, all union'd into one same-origin set:
//  1. Fetch sitemap.xml at rootUrl/sitemap.xml — handles MPAs and the SPA pages
//     that won't expose internal routes via <a href>.
//  2. Load rootUrl in a real browser, harvest <a href>, [role=link] href,
//     elements with `data-href`, and Next.js `<link rel="next">` etc.
export async function discoverLinks(opts: DiscoverOptions): Promise<string[]> {
  const max = opts.maxLinks ?? 200;
  const root = new URL(opts.rootUrl);
  const seen = new Set<string>([canonicalUrl(opts.rootUrl)]);

  // Strategy 1: sitemap.xml
  try {
    const r = await fetchWithTimeout(new URL("/sitemap.xml", root).toString(), 8_000);
    if (r) {
      for (const u of extractSitemapUrls(r, root)) {
        if (seen.size >= max) break;
        seen.add(canonicalUrl(u));
      }
    }
  } catch {}

  if (seen.size < max) {
    const ctx = await newContext({ storageStatePath: opts.storageStatePath });
    try {
      const page = await ctx.newPage();
      await page.goto(opts.rootUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(1500); // SPA hydration

      const candidates = await page.evaluate(() => {
        const out: string[] = [];
        const push = (h: string | null | undefined) => { if (h) out.push(h); };
        document.querySelectorAll("a[href]").forEach((a) => push((a as HTMLAnchorElement).href));
        document.querySelectorAll("[role='link']").forEach((el) => push(el.getAttribute("data-href") || el.getAttribute("href")));
        document.querySelectorAll("[data-href]").forEach((el) => push(el.getAttribute("data-href")));
        document.querySelectorAll("link[rel='next'],link[rel='prev']").forEach((el) => push((el as HTMLLinkElement).href));
        return out;
      });

      for (const h of candidates) {
        try {
          const u = new URL(h, opts.rootUrl);
          if (u.origin !== root.origin) continue;
          seen.add(canonicalUrl(u.toString()));
          if (seen.size >= max) break;
        } catch {}
      }
    } finally {
      await ctx.close();
    }
  }

  const all = Array.from(seen);
  if (!opts.dedupeByTemplate) return all;
  // Keep the first URL per path-template, dropping near-duplicates like
  // /posts/1, /posts/2, /posts/abc-123 (they all share template /posts/:id).
  const byTemplate = new Map<string, string>();
  for (const u of all) {
    const t = urlTemplate(u);
    if (!byTemplate.has(t)) byTemplate.set(t, u);
  }
  return Array.from(byTemplate.values());
}

async function fetchWithTimeout(url: string, ms: number): Promise<string | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("xml") && !ct.includes("text")) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractSitemapUrls(xml: string, root: URL): string[] {
  // Lightweight extraction. We don't follow nested sitemapindex chains — single
  // level is enough for discovery; the user can paste extras manually.
  const urls: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    try {
      const u = new URL(m[1].trim());
      if (u.origin !== root.origin) continue;
      u.hash = "";
      urls.push(u.toString());
    } catch {}
  }
  return urls;
}

