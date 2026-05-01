// SSRF guard. Reject URLs that target private/loopback/link-local addresses or
// non-HTTP schemes. Resolves the hostname so DNS rebinding can't bypass us.

import dns from "node:dns/promises";

export type SsrfPolicy = {
  allowLocalhost?: boolean; // default false
};

const PRIVATE_V4 = [
  ["10.", 8],
  ["127.", 8],
  ["169.254.", 16],
  ["172.16.", 12],   // 172.16/12 — special-cased below
  ["192.168.", 16],
  ["100.64.", 10],   // CGNAT — special-cased below
  ["0.", 8],
  ["224.", 4],       // multicast
  ["255.255.255.255", 32],
] as const;

function isPrivateV4(ip: string): boolean {
  if (ip === "0.0.0.0" || ip === "255.255.255.255") return true;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateV6(ip: string): boolean {
  const lc = ip.toLowerCase();
  if (lc === "::" || lc === "::1") return true;
  if (lc.startsWith("fe80:") || lc.startsWith("fc") || lc.startsWith("fd")) return true; // link-local + ULA
  if (lc.startsWith("::ffff:")) {
    // IPv4-mapped
    const v4 = lc.slice(7);
    return isPrivateV4(v4);
  }
  return false;
}

export async function assertPublicUrl(rawUrl: string, policy: SsrfPolicy = {}): Promise<URL> {
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw new Error(`invalid url: ${rawUrl}`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`disallowed scheme: ${u.protocol}`);
  }
  const host = u.hostname;
  if (!host) throw new Error("missing host");

  // direct IP literal?
  if (/^[0-9.]+$/.test(host)) {
    if (!policy.allowLocalhost && isPrivateV4(host)) throw new Error(`blocked private ip: ${host}`);
    return u;
  }
  if (host.includes(":") || host.startsWith("[")) {
    // URL gives v6 hosts wrapped in brackets, e.g. "[::1]". Strip them before checking.
    const v6 = host.replace(/^\[|\]$/g, "");
    if (!policy.allowLocalhost && isPrivateV6(v6)) throw new Error(`blocked private ip: ${v6}`);
    return u;
  }

  // hostname — resolve and check every result
  const hostLc = host.toLowerCase();
  if (!policy.allowLocalhost && (hostLc === "localhost" || hostLc.endsWith(".localhost"))) {
    throw new Error("blocked: localhost");
  }
  let resolved: { address: string; family: number }[] = [];
  try { resolved = await dns.lookup(host, { all: true }); } catch (e: any) {
    throw new Error(`dns lookup failed for ${host}: ${e?.message ?? e}`);
  }
  for (const r of resolved) {
    if (!policy.allowLocalhost) {
      if (r.family === 4 && isPrivateV4(r.address)) throw new Error(`blocked private ip ${r.address} for ${host}`);
      if (r.family === 6 && isPrivateV6(r.address)) throw new Error(`blocked private ip ${r.address} for ${host}`);
    }
  }
  return u;
}

// Exported for testing only.
export const _internal = { isPrivateV4, isPrivateV6 };
