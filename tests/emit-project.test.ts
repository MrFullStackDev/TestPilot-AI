import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { emitProject } from "../src/server/generator/emit-project";
import type { PageAnalysis } from "../src/server/llm/prompts/analyzePage";
import type { TestPlan } from "../src/server/llm/prompts/generateTests";

describe("emitProject", () => {
  it("emits a runnable Playwright project from a synthetic plan", () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "emit-"));
    const loginPage: PageAnalysis = {
      pageName: "LoginPage",
      elements: [
        { alias: "emailInput", purpose: "email input", kind: "input", locators: [{ strategy: "testid", value: "email" }] },
        { alias: "passwordInput", purpose: "password input", kind: "input", locators: [{ strategy: "testid", value: "password" }] },
        { alias: "submit", purpose: "sign in button", kind: "button", locators: [{ strategy: "role", value: "button name=Sign in" }] },
      ],
      observations: [],
    };
    const plan: TestPlan = {
      cases: [
        {
          name: "login form is visible",
          feature: "auth",
          description: undefined,
          steps: [
            { action: "goto", url: "/login" },
            { action: "expect_visible", pageObject: "LoginPage", alias: "emailInput" },
            { action: "expect_visible", pageObject: "LoginPage", alias: "submit" },
          ],
        },
        {
          name: "user can submit valid creds",
          feature: "auth",
          description: undefined,
          steps: [
            { action: "goto", url: "/login" },
            { action: "fill", pageObject: "LoginPage", alias: "emailInput", value: "alice@example.com" },
            { action: "fill", pageObject: "LoginPage", alias: "passwordInput", value: "hunter2" },
            { action: "click", pageObject: "LoginPage", alias: "submit" },
            { action: "expect_url", pattern: "/dashboard" },
          ],
        },
      ],
    };

    const result = emitProject({
      outDir,
      projectName: "Synthetic",
      projectSlug: "synthetic",
      baseURL: "https://example.com",
      pageObjectsByName: { LoginPage: loginPage },
      plan,
    });

    expect(result.warnings).toEqual([]);
    expect(result.tests).toHaveLength(2);
    expect(fs.existsSync(path.join(outDir, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "playwright.config.ts"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "page-objects/LoginPage.ts"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "tests/auth.spec.ts"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, ".testgen/locators.json"))).toBe(true);

    const spec = fs.readFileSync(path.join(outDir, "tests/auth.spec.ts"), "utf8");
    expect(spec).toContain("import { LoginPage } from \"../page-objects/LoginPage\";");
    expect(spec).toContain("loginPage.emailInput.fill(\"alice@example.com\")");
    expect(spec).toContain("loginPage.submit.click()");
    expect(spec).toContain("expect(page).toHaveURL(\"/dashboard\")");

    const po = fs.readFileSync(path.join(outDir, "page-objects/LoginPage.ts"), "utf8");
    expect(po).toContain("getByTestId(\"email\")");
    expect(po).toContain("getByRole(\"button\", { name: \"Sign in\" })");

    fs.rmSync(outDir, { recursive: true, force: true });
  });
});
