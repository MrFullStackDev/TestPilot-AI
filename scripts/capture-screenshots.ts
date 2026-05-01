// Captures screenshots of the running dev server at desktop resolution and
// saves them under screenshots/. Run while `npm run dev` is up:
//   npx tsx scripts/capture-screenshots.ts

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const OUT_DIR = path.resolve(process.cwd(), "screenshots");

const SHOTS: Array<{ name: string; path: string; setup?: (page: any) => Promise<void> }> = [
  { name: "01-projects.png", path: "/" },
  {
    // Distill is local-only (no LLM call), so we run a sample and capture the
    // result — gives a far more representative shot than the empty form.
    name: "02-dom-tools-distill.png",
    path: "/locators",
    setup: async (page) => {
      await page.getByRole("button", { name: /Try a sample/ }).click();
      await page.getByRole("button", { name: /^Distill$/ }).click();
      await page.getByText(/Distilled output/).waitFor({ timeout: 10_000 });
      await page.waitForTimeout(300);
    },
  },
  {
    name: "03-dom-tools-page-object.png",
    path: "/locators",
    setup: async (page) => {
      // switch to "Generate Page Object" mode and load the sample so the
      // framework picker, page-name field, and CTA all render meaningfully.
      await page.getByRole("tab", { name: /Generate Page Object/ }).click();
      await page.getByRole("button", { name: /Try a sample/ }).click();
      await page.waitForTimeout(200);
    },
  },
  { name: "04-tickets.png", path: "/tickets" },
  { name: "05-settings.png", path: "/settings" },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const page = await ctx.newPage();

  for (const shot of SHOTS) {
    const url = BASE + shot.path;
    process.stdout.write(`-> ${shot.name} (${url})\n`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });
    if (shot.setup) await shot.setup(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, shot.name), fullPage: false });
  }

  await ctx.close();
  await browser.close();
  console.log(`Saved ${SHOTS.length} screenshots to ${OUT_DIR}`);
})();
