import { chromium, type Browser, type BrowserContext } from "playwright";
import fs from "node:fs";

let _browser: Browser | null = null;
let _shutdownInstalled = false;

export async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({ headless: true });
  installShutdownHooksOnce();
  return _browser;
}

export async function newContext(opts: { storageStatePath?: string | null; userAgent?: string } = {}): Promise<BrowserContext> {
  const browser = await getBrowser();
  const ctxOpts: Parameters<Browser["newContext"]>[0] = {
    userAgent: opts.userAgent,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  };
  if (opts.storageStatePath && fs.existsSync(opts.storageStatePath)) {
    ctxOpts.storageState = opts.storageStatePath;
  }
  return browser.newContext(ctxOpts);
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

// Install once per process: on SIGTERM/SIGINT/exit, close the cached browser
// so Chromium doesn't outlive the server. Best-effort: we can't await async
// work in 'exit', but SIGTERM/SIGINT give us a chance to await `close()`.
function installShutdownHooksOnce() {
  if (_shutdownInstalled) return;
  _shutdownInstalled = true;
  const handleSignal = (sig: NodeJS.Signals) => {
    closeBrowser().finally(() => {
      // Re-raise the signal with the default handler so the process exits.
      process.kill(process.pid, sig);
    });
  };
  process.once("SIGTERM", handleSignal);
  process.once("SIGINT", handleSignal);
  process.once("beforeExit", () => { closeBrowser().catch(() => {}); });
}
