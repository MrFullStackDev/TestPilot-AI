import fs from "node:fs";
import path from "node:path";
import { newContext } from "./browser-pool";
import { trimDom } from "./dom-trim";
import { hashTrimmedDom } from "./dom-hash";

export type CaptureResult = {
  url: string;
  domPath: string;
  trimmedPath: string;
  a11yPath: string;
  screenshotPath: string;
  networkPath: string;
  domHash: string;
  bytes: { dom: number; trimmed: number };
};

export type CaptureOptions = {
  url: string;
  outDir: string; // data/snapshots/<slug>/<page-slug>/
  storageStatePath?: string | null;
  timeoutMs?: number;
};

export async function capturePage(opts: CaptureOptions): Promise<CaptureResult> {
  fs.mkdirSync(opts.outDir, { recursive: true });

  const ctx = await newContext({ storageStatePath: opts.storageStatePath });
  const page = await ctx.newPage();

  const network: Array<{ url: string; method: string; status: number; type: string }> = [];
  page.on("response", (resp) => {
    network.push({
      url: resp.url(),
      method: resp.request().method(),
      status: resp.status(),
      type: resp.request().resourceType(),
    });
  });

  try {
    await page.goto(opts.url, { waitUntil: "networkidle", timeout: opts.timeoutMs ?? 30_000 });

    const html = await page.content();
    const trimmed = trimDom(html);
    let a11y: unknown = null;
    try {
      a11y = (page as any).accessibility ? await (page as any).accessibility.snapshot({ interestingOnly: false }) : null;
    } catch {
      a11y = null;
    }
    if (!a11y) {
      // Fallback: light DOM-derived a11y info from ARIA roles/labels.
      a11y = await page.evaluate(() => {
        const out: Array<{ role: string; name: string; tag: string }> = [];
        const sel = "button, [role], a[href], input, select, textarea, [aria-label], h1, h2, h3";
        document.querySelectorAll(sel).forEach((el) => {
          const e = el as HTMLElement;
          const role = e.getAttribute("role") || e.tagName.toLowerCase();
          const name = (e.getAttribute("aria-label") || e.innerText || (e as HTMLInputElement).placeholder || "").trim().slice(0, 80);
          if (name || role) out.push({ role, name, tag: e.tagName.toLowerCase() });
        });
        return out;
      });
    }

    const domPath = path.join(opts.outDir, "dom.html");
    const trimmedPath = path.join(opts.outDir, "dom-trimmed.html");
    const a11yPath = path.join(opts.outDir, "a11y.json");
    const screenshotPath = path.join(opts.outDir, "screenshot.png");
    const networkPath = path.join(opts.outDir, "network.json");

    fs.writeFileSync(domPath, html);
    fs.writeFileSync(trimmedPath, trimmed);
    fs.writeFileSync(a11yPath, JSON.stringify(a11y ?? {}, null, 2));
    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.writeFileSync(networkPath, JSON.stringify(network, null, 2));

    return {
      url: opts.url,
      domPath,
      trimmedPath,
      a11yPath,
      screenshotPath,
      networkPath,
      domHash: hashTrimmedDom(trimmed),
      bytes: { dom: Buffer.byteLength(html), trimmed: Buffer.byteLength(trimmed) },
    };
  } finally {
    await ctx.close();
  }
}
