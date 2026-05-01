import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { spawn } from "node:child_process";
import { emitProject } from "../src/server/generator/emit-project";
import type { PageAnalysis } from "../src/server/llm/prompts/analyzePage";
import type { TestPlan } from "../src/server/llm/prompts/generateTests";

// Real proof: emit a synthetic project and run `npx playwright test` against it,
// pointing at a local fixture server. Asserts JSON reporter shows a passing test.

describe("emitted project actually runs Playwright", () => {
  it("passes a synthetic test against a local fixture", async () => {
    const port = 41719;
    const server = http.createServer((req, res) => {
      const url = req.url || "/";
      if (url === "/" || url === "/index.html") {
        res.setHeader("content-type", "text/html");
        res.end(`<!doctype html><html><head><title>Home</title></head><body>
          <h1>Welcome</h1>
          <a href="/login.html">Log in</a>
        </body></html>`);
      } else if (url === "/login.html") {
        res.setHeader("content-type", "text/html");
        res.end(`<!doctype html><html><head><title>Login</title></head><body>
          <h1>Log in</h1>
          <input data-testid="email" placeholder="Email" />
          <input data-testid="password" type="password" placeholder="Password" />
          <button>Sign in</button>
        </body></html>`);
      } else {
        res.statusCode = 404; res.end();
      }
    });
    await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));

    // sanity: confirm server reachable
    const sanity = await fetch(`http://127.0.0.1:${port}/`).then((x) => x.text()).catch((e) => `FETCH ERR: ${e?.message}`);
    if (!sanity.includes("Welcome")) throw new Error(`fixture server unreachable: ${sanity.slice(0, 100)}`);

    try {
      const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "emit-run-"));
      const home: PageAnalysis = {
        pageName: "HomePage",
        elements: [
          { alias: "title", purpose: "page heading", kind: "heading", locators: [{ strategy: "role", value: "heading name=Welcome" }] },
          { alias: "loginLink", purpose: "log in link", kind: "link", locators: [{ strategy: "role", value: "link name=Log in" }] },
        ],
        observations: [],
      };
      const plan: TestPlan = {
        cases: [{
          name: "homepage shows welcome and links to login",
          feature: "navigation",
          steps: [
            { action: "goto", url: "/" },
            { action: "expect_visible", pageObject: "HomePage", alias: "title" },
            { action: "click", pageObject: "HomePage", alias: "loginLink" },
            { action: "expect_url", pattern: "/login.html" },
          ],
        }],
      };

      emitProject({
        outDir,
        projectName: "Smoke",
        projectSlug: "smoke",
        baseURL: `http://127.0.0.1:${port}`,
        pageObjectsByName: { HomePage: home },
        plan,
      });

      // Symlink @playwright/test from parent so we don't re-install.
      const repoNm = path.resolve(__dirname, "..", "node_modules");
      const stagedNm = path.join(outDir, "node_modules");
      fs.mkdirSync(stagedNm, { recursive: true });
      for (const dep of ["@playwright", "playwright", "playwright-core", "@types", "fsevents", "dotenv"]) {
        const src = path.join(repoNm, dep);
        const dst = path.join(stagedNm, dep);
        if (fs.existsSync(src) && !fs.existsSync(dst)) fs.symlinkSync(src, dst, "dir");
      }

      // Run via the parent's playwright binary, async so the fixture server keeps serving.
      const playwrightBin = path.join(repoNm, ".bin", "playwright");
      const reporterPath = path.join(outDir, "report.json");
      const res = await new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
        const p = spawn(playwrightBin, ["test", "--reporter=json"], {
          cwd: outDir,
          env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reporterPath, BASE_URL: `http://127.0.0.1:${port}` },
        });
        let out = ""; let err = "";
        p.stdout.on("data", (d) => (out += d.toString()));
        p.stderr.on("data", (d) => (err += d.toString()));
        p.on("close", (code) => resolve({ code, out, err }));
      });

      if (res.code !== 0) {
        console.error("STDOUT:\n", res.out);
        console.error("STDERR:\n", res.err);
      }
      expect(res.code).toBe(0);
      expect(fs.existsSync(reporterPath)).toBe(true);
      const report = JSON.parse(fs.readFileSync(reporterPath, "utf8"));
      // Walk to find at least one passed spec
      const passed = JSON.stringify(report).includes('"status":"passed"');
      expect(passed).toBe(true);

      fs.rmSync(outDir, { recursive: true, force: true });
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }, 90_000);
});
