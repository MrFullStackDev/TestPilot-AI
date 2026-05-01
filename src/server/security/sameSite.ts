// Approximate "same registrable domain" check. We don't ship a full PSL —
// instead we treat anything sharing the last two labels as same-site
// (example.com vs www.example.com vs auth.example.com all match). Multi-part
// TLDs like .co.uk get a slightly looser match; that's acceptable for the
// auth-recorder use case where the only attacker-controlled signal is a redirect.

export function sameRegistrableDomain(a: string, b: string): boolean {
  const ah = host(a);
  const bh = host(b);
  if (!ah || !bh) return false;
  if (ah === bh) return true;
  const an = ah.split(".");
  const bn = bh.split(".");
  if (an.length < 2 || bn.length < 2) return false;
  const aTail = an.slice(-2).join(".");
  const bTail = bn.slice(-2).join(".");
  return aTail === bTail;
}

function host(s: string): string | null {
  try { return new URL(s).hostname.toLowerCase(); } catch { return null; }
}
