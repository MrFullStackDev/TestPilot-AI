import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { sameRegistrableDomain } from "@/server/security/sameSite";

export type AuthRecordOptions = {
  loginUrl?: string;
  rootUrl: string;
  storageStatePath: string; // where to write
  timeoutMs?: number;
};

export type AuthRecordResult = {
  cookies: number;
  origins: number;
  warnings: string[];
};

// Opens a HEADED Chromium window. User completes auth manually. The function
// resolves when the browser window is closed by the user, saving storageState.
//
// Domain restriction: every navigation that lands on a domain different from
// rootUrl's registrable domain is allowed (so OAuth providers work) but we
// drop any cookies for those foreign origins from the saved state. Rationale:
// the user often legitimately sees an external auth page; what we MUST NOT do
// is persist cookies for those external sites, since those would later be
// silently used by every generated test run.
export async function recordAuth(opts: AuthRecordOptions): Promise<AuthRecordResult> {
  fs.mkdirSync(path.dirname(opts.storageStatePath), { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const target = opts.loginUrl || opts.rootUrl;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs ?? 60_000 }).catch(() => {});

  // Wait until the user closes the page or the browser
  await new Promise<void>((resolve) => {
    const finish = async () => {
      try { await context.storageState({ path: opts.storageStatePath }); } catch {}
      resolve();
    };
    page.on("close", finish);
    browser.on("disconnected", finish);
  });

  await browser.close().catch(() => {});

  const raw = JSON.parse(fs.readFileSync(opts.storageStatePath, "utf8"));
  const warnings: string[] = [];

  const filteredCookies = (raw.cookies ?? []).filter((c: any) => {
    const ok = sameRegistrableDomain(`https://${(c.domain ?? "").replace(/^\./, "")}`, opts.rootUrl);
    if (!ok) warnings.push(`dropped foreign-domain cookie for ${c.domain}`);
    return ok;
  });
  const filteredOrigins = (raw.origins ?? []).filter((o: any) => {
    const ok = sameRegistrableDomain(o.origin, opts.rootUrl);
    if (!ok) warnings.push(`dropped foreign-origin storage for ${o.origin}`);
    return ok;
  });

  const filtered = { cookies: filteredCookies, origins: filteredOrigins };
  fs.writeFileSync(opts.storageStatePath, JSON.stringify(filtered, null, 2));

  return { cookies: filteredCookies.length, origins: filteredOrigins.length, warnings };
}
