// Seeds the local SQLite DB with realistic-looking demo data for screenshots
// and resume-style demos. Idempotent: re-running replaces the demo rows.
//
// Usage: npx tsx scripts/seed-demo.ts
//
// Wipe with: npx tsx scripts/seed-demo.ts --reset (just deletes the demo
// projects; leaves any real projects you've created untouched).

import { db } from "../src/server/db/client";

const DEMO_SLUGS = ["acme-shop", "docs-platform", "playgrounds-app"];

function reset() {
  for (const slug of DEMO_SLUGS) {
    const row = db().prepare("SELECT id FROM projects WHERE slug = ?").get(slug) as { id: number } | undefined;
    if (row) db().prepare("DELETE FROM projects WHERE id = ?").run(row.id);
  }
}

function isoMinutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString().replace("T", " ").slice(0, 19);
}

function seed() {
  reset();

  const projects = [
    { slug: "acme-shop",       name: "Acme Shop",        root_url: "https://shop.example.com", framework: "playwright-ts", createdMinAgo: 7 * 24 * 60 },
    { slug: "docs-platform",   name: "Docs Platform",    root_url: "https://docs.example.com", framework: "playwright-ts", createdMinAgo: 3 * 24 * 60 },
    { slug: "playgrounds-app", name: "Playgrounds App",  root_url: "https://play.example.com", framework: "cypress",       createdMinAgo: 1 * 24 * 60 },
  ];

  for (const p of projects) {
    const info = db().prepare(
      "INSERT INTO projects (slug, name, root_url, framework, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(p.slug, p.name, p.root_url, p.framework, isoMinutesAgo(p.createdMinAgo));
    const projectId = Number(info.lastInsertRowid);

    // Tests with a mix of healthy / flaky / quarantined.
    const testsPerProject: Record<string, Array<{ name: string; flaky?: boolean; quar?: boolean }>> = {
      "acme-shop": [
        { name: "user can sign in" },
        { name: "user can search products" },
        { name: "user can add product to cart", flaky: true },
        { name: "user can checkout with saved card" },
        { name: "user can apply coupon" },
        { name: "guest can browse without login" },
        { name: "user can update profile" },
        { name: "stale: legacy admin link", quar: true },
      ],
      "docs-platform": [
        { name: "search returns relevant pages" },
        { name: "deep link to anchor scrolls correctly" },
        { name: "code block has copy button", flaky: true },
        { name: "version switcher updates URL" },
        { name: "404 page shows search" },
      ],
      "playgrounds-app": [
        { name: "render hello-world template" },
        { name: "fork a sandbox preserves files" },
        { name: "console errors surface in panel" },
      ],
    };

    const tests = testsPerProject[p.slug] ?? [];
    const insertTest = db().prepare(
      `INSERT INTO tests (project_id, name, file_path, page_object_path, locator_meta_json, page_url, primary_locator_key, flaky_flag, flaky_reason, quarantined)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const testIds: number[] = [];
    for (const t of tests) {
      const slug = t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const id = Number(
        insertTest.run(
          projectId,
          t.name,
          `tests/${slug}.spec.ts`,
          `pages/HomePage.ts`,
          JSON.stringify({ "homePage.signInButton": [{ strategy: "testid", value: "sign-in" }] }),
          p.root_url,
          "homePage.signInButton",
          t.flaky ? 1 : 0,
          t.flaky ? "duration variance > 0.5σ over last 20 runs" : null,
          t.quar ? 1 : 0,
        ).lastInsertRowid
      );
      testIds.push(id);
    }

    // A run, with mostly-pass results and one failure.
    const runInfo = db().prepare(
      `INSERT INTO runs (project_id, started_at, ended_at, status) VALUES (?, ?, ?, ?)`
    ).run(projectId, isoMinutesAgo(45), isoMinutesAgo(43), "passed");
    const runId = Number(runInfo.lastInsertRowid);

    const insertResult = db().prepare(
      `INSERT INTO test_results (run_id, test_id, test_name, status, error, duration_ms) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const failedIdx = p.slug === "acme-shop" ? 2 : -1;
    for (let i = 0; i < testIds.length; i++) {
      const status = i === failedIdx ? "failed" : "passed";
      const error = status === "failed"
        ? "Error: locator.click: Test timeout exceeded\n  at locator getByTestId('add-to-cart')\n  expected: visible\n  found: 0 elements"
        : null;
      insertResult.run(runId, testIds[i], tests[i].name, status, error, 800 + Math.floor(Math.random() * 4000));
    }

    // One pending heal event for the failing acme-shop test.
    if (p.slug === "acme-shop" && failedIdx >= 0) {
      db().prepare(
        `INSERT INTO heal_events (test_id, run_id, old_locator, new_locator, rationale, accepted, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`
      ).run(
        testIds[failedIdx],
        runId,
        JSON.stringify({ key: "homePage.addToCartButton", strategy: "testid", value: "add-to-cart" }),
        JSON.stringify({ key: "homePage.addToCartButton", strategy: "role", value: "button name='Add to cart'" }),
        "Page now uses an accessible button without the original test-id; role+name resolves uniquely.",
        isoMinutesAgo(30),
      );
    }

    // Some llm_calls so cost shows non-zero.
    const insertLlm = db().prepare(
      `INSERT INTO llm_calls (project_id, provider, model, input_tokens, output_tokens, cached_tokens, cost_usd, purpose, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const calls = p.slug === "acme-shop" ? 28 : p.slug === "docs-platform" ? 12 : 6;
    for (let i = 0; i < calls; i++) {
      const isCheap = i % 3 !== 0;
      insertLlm.run(
        projectId,
        "anthropic",
        isCheap ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6",
        2000 + Math.floor(Math.random() * 6000),
        400 + Math.floor(Math.random() * 1200),
        isCheap ? Math.floor(Math.random() * 800) : 0,
        isCheap ? 0.003 + Math.random() * 0.01 : 0.05 + Math.random() * 0.08,
        i % 3 === 0 ? "generate_plan" : "analyze_page",
        isoMinutesAgo(60 + i * 5),
      );
    }
  }

  console.log(`Seeded ${projects.length} demo projects.`);
}

const argv = process.argv.slice(2);
if (argv.includes("--reset")) {
  reset();
  console.log("Reset demo data.");
} else {
  seed();
}
