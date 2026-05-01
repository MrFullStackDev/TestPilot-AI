import { describe, it, expect } from "vitest";
import { emitForFramework, type Framework } from "../src/server/generator/frameworks";
import type { PageAnalysis } from "../src/server/llm/prompts/analyzePage";

const SAMPLE: PageAnalysis = {
  pageName: "LoginPage",
  elements: [
    { alias: "emailInput", purpose: "email input", kind: "input", locators: [{ strategy: "testid", value: "email" }] },
    { alias: "submitBtn",  purpose: "sign in button", kind: "button", locators: [{ strategy: "role", value: "button name=Sign in" }] },
    { alias: "forgotLink", purpose: "forgot password link", kind: "link", locators: [{ strategy: "text", value: "Forgot?" }] },
    { alias: "noticeText", purpose: "form-level notice", kind: "label", locators: [{ strategy: "label", value: "Privacy notice" }] },
    { alias: "fancyXpath", purpose: "fancy node", kind: "other", locators: [{ strategy: "xpath", value: "//div[contains(@class,'foo`+nope+`')]" }] },
  ],
  observations: [],
};

const expectations: Array<{ fw: Framework; mustContain: string[] }> = [
  {
    fw: "playwright-ts",
    mustContain: [
      'getByTestId("email")',
      'getByRole("button", { name: "Sign in" })',
      'getByText("Forgot?", { exact: false })',
      'getByLabel("Privacy notice")',
    ],
  },
  {
    fw: "playwright-py",
    mustContain: [
      'self.page.get_by_test_id("email")',
      'self.page.get_by_role("button", name="Sign in")',
      "@property",
    ],
  },
  {
    fw: "cypress",
    mustContain: [
      'cy.findByTestId("email")',
      'cy.findByRole("button", { name: "Sign in" })',
      'cy.findByText("Forgot?")',
    ],
  },
  {
    fw: "webdriverio",
    mustContain: [
      'data-testid=\'email\'',
      'role=\'button\'',
    ],
  },
  {
    fw: "selenium-java",
    mustContain: [
      "import org.openqa.selenium.By;",
      "By.cssSelector(\"[data-testid='email']\")",
      "public WebElement",
    ],
  },
  {
    fw: "selenium-python",
    mustContain: [
      "from selenium.webdriver.common.by import By",
      "By.CSS_SELECTOR, \"[data-testid='email']\"",
      "@property",
    ],
  },
];

describe("emitForFramework", () => {
  for (const e of expectations) {
    it(`emits valid-looking ${e.fw} output`, () => {
      const out = emitForFramework(SAMPLE, e.fw);
      expect(out.code.length).toBeGreaterThan(0);
      expect(out.filename).toMatch(/^LoginPage|login_page/);
      for (const s of e.mustContain) expect(out.code).toContain(s);
    });
  }

  it("xpath is rendered into a string literal, never as a template substitution", () => {
    // The hostile value contains backticks and a `+nope+` fragment that would
    // execute as JS if it landed inside a template literal. We assert that no
    // template-literal opener (\\`xpath=) appears anywhere in the output.
    const fws: Framework[] = ["playwright-ts", "playwright-py", "cypress", "webdriverio", "selenium-java", "selenium-python"];
    for (const fw of fws) {
      const code = emitForFramework(SAMPLE, fw).code;
      // Look for a backtick that introduces a template literal containing
      // an interpolation `${...}` near the xpath — that would be the attack.
      expect(code).not.toMatch(/`[^`]*\$\{[^`]*xpath/);
      expect(code).not.toMatch(/`xpath=/);
    }
  });
});
