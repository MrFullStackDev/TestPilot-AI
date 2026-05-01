// Page-object emitters for multiple test frameworks. Each takes the same
// portable PageAnalysis (alias + ranked locators) and produces idiomatic source
// for that framework. The locator strategy → call mapping is per-framework.

import type { PageAnalysis } from "@/server/llm/prompts/analyzePage";

export type Framework =
  | "playwright-ts"
  | "playwright-py"
  | "cypress"
  | "webdriverio"
  | "selenium-java"
  | "selenium-python";

export const FRAMEWORK_LABELS: Record<Framework, string> = {
  "playwright-ts": "Playwright (TypeScript)",
  "playwright-py": "Playwright (Python)",
  cypress: "Cypress",
  webdriverio: "WebdriverIO",
  "selenium-java": "Selenium (Java)",
  "selenium-python": "Selenium (Python)",
};

export type FrameworkOutput = { filename: string; language: string; code: string };

export function emitForFramework(analysis: PageAnalysis, framework: Framework): FrameworkOutput {
  const className = pascal(analysis.pageName);
  switch (framework) {
    case "playwright-ts":   return playwrightTs(analysis, className);
    case "playwright-py":   return playwrightPy(analysis, className);
    case "cypress":         return cypress(analysis, className);
    case "webdriverio":     return webdriverio(analysis, className);
    case "selenium-java":   return seleniumJava(analysis, className);
    case "selenium-python": return seleniumPython(analysis, className);
  }
}

// ---- Playwright TypeScript ----------------------------------------------------

function playwrightTs(a: PageAnalysis, className: string): FrameworkOutput {
  const lines = [
    `import type { Page, Locator } from "@playwright/test";`,
    "",
    `export class ${className} {`,
    `  constructor(public readonly page: Page) {}`,
    "",
  ];
  for (const el of a.elements) {
    const top = el.locators[0];
    if (!top) continue;
    lines.push(`  /** ${escapeC(el.purpose)} */`);
    lines.push(`  get ${alias(el.alias)}(): Locator { return ${ptsLoc(top)}; }`);
    lines.push("");
  }
  lines.push("}");
  return { filename: `${className}.ts`, language: "typescript", code: lines.join("\n") };
}

function ptsLoc(c: { strategy: string; value: string }): string {
  const v = JSON.stringify(c.value);
  switch (c.strategy) {
    case "testid":      return `this.page.getByTestId(${v})`;
    case "role": {
      const m = c.value.match(/^([a-zA-Z]+)(?:\s+name=(.+))?$/);
      if (m) return m[2]
        ? `this.page.getByRole(${JSON.stringify(m[1])}, { name: ${JSON.stringify(m[2].replace(/^['"]|['"]$/g, ""))} })`
        : `this.page.getByRole(${JSON.stringify(m[1])})`;
      return `this.page.getByRole(${v} as any)`;
    }
    case "label":       return `this.page.getByLabel(${v})`;
    case "placeholder": return `this.page.getByPlaceholder(${v})`;
    case "text":        return `this.page.getByText(${v}, { exact: false })`;
    case "css":         return `this.page.locator(${v})`;
    case "xpath":       return `this.page.locator(${JSON.stringify("xpath=" + c.value)})`;
    default:            return `this.page.locator(${v})`;
  }
}

// ---- Playwright Python -------------------------------------------------------

function playwrightPy(a: PageAnalysis, className: string): FrameworkOutput {
  const lines = [
    `from playwright.sync_api import Page, Locator`,
    "",
    `class ${className}:`,
    `    def __init__(self, page: Page):`,
    `        self.page = page`,
    "",
  ];
  for (const el of a.elements) {
    const top = el.locators[0];
    if (!top) continue;
    lines.push(`    @property`);
    lines.push(`    def ${snake(el.alias)}(self) -> Locator:`);
    lines.push(`        """${escapeC(el.purpose)}"""`);
    lines.push(`        return ${ppyLoc(top)}`);
    lines.push("");
  }
  return { filename: `${snake(className)}.py`, language: "python", code: lines.join("\n") };
}

function ppyLoc(c: { strategy: string; value: string }): string {
  const v = pyStr(c.value);
  switch (c.strategy) {
    case "testid":      return `self.page.get_by_test_id(${v})`;
    case "role": {
      const m = c.value.match(/^([a-zA-Z]+)(?:\s+name=(.+))?$/);
      if (m) return m[2]
        ? `self.page.get_by_role(${pyStr(m[1])}, name=${pyStr(m[2].replace(/^['"]|['"]$/g, ""))})`
        : `self.page.get_by_role(${pyStr(m[1])})`;
      return `self.page.get_by_role(${v})`;
    }
    case "label":       return `self.page.get_by_label(${v})`;
    case "placeholder": return `self.page.get_by_placeholder(${v})`;
    case "text":        return `self.page.get_by_text(${v}, exact=False)`;
    case "css":         return `self.page.locator(${v})`;
    case "xpath":       return `self.page.locator(${pyStr("xpath=" + c.value)})`;
    default:            return `self.page.locator(${v})`;
  }
}

// ---- Cypress (TypeScript) ----------------------------------------------------
// Uses the @testing-library/cypress aliases (cy.findByTestId etc.) when available
// — otherwise falls back to cy.get/css.

function cypress(a: PageAnalysis, className: string): FrameworkOutput {
  const lines = [
    `// Generated. Add `,
    `//   import "@testing-library/cypress/add-commands";`,
    `// to your support file for getByTestId/getByRole/getByLabel etc. to work.`,
    "",
    `export class ${className} {`,
  ];
  for (const el of a.elements) {
    const top = el.locators[0];
    if (!top) continue;
    lines.push(`  /** ${escapeC(el.purpose)} */`);
    lines.push(`  ${alias(el.alias)}() { return ${cypLoc(top)}; }`);
    lines.push("");
  }
  lines.push("}");
  lines.push(`export const ${camel(className)} = new ${className}();`);
  return { filename: `${className}.ts`, language: "typescript", code: lines.join("\n") };
}

function cypLoc(c: { strategy: string; value: string }): string {
  const v = JSON.stringify(c.value);
  switch (c.strategy) {
    case "testid":      return `cy.findByTestId(${v})`;
    case "role": {
      const m = c.value.match(/^([a-zA-Z]+)(?:\s+name=(.+))?$/);
      if (m) return m[2]
        ? `cy.findByRole(${JSON.stringify(m[1])}, { name: ${JSON.stringify(m[2].replace(/^['"]|['"]$/g, ""))} })`
        : `cy.findByRole(${JSON.stringify(m[1])})`;
      return `cy.findByRole(${v})`;
    }
    case "label":       return `cy.findByLabelText(${v})`;
    case "placeholder": return `cy.findByPlaceholderText(${v})`;
    case "text":        return `cy.findByText(${v})`;
    case "css":         return `cy.get(${v})`;
    case "xpath":       return `cy.xpath(${v}) /* requires cypress-xpath */`;
    default:            return `cy.get(${v})`;
  }
}

// ---- WebdriverIO (TypeScript) ------------------------------------------------

function webdriverio(a: PageAnalysis, className: string): FrameworkOutput {
  const lines = [
    `import { browser, $ } from "@wdio/globals";`,
    `import type { ChainablePromiseElement } from "webdriverio";`,
    "",
    `export class ${className} {`,
  ];
  for (const el of a.elements) {
    const top = el.locators[0];
    if (!top) continue;
    lines.push(`  /** ${escapeC(el.purpose)} */`);
    lines.push(`  get ${alias(el.alias)}(): ChainablePromiseElement<WebdriverIO.Element> { return ${wdioLoc(top)}; }`);
    lines.push("");
  }
  lines.push("}");
  lines.push(`export default new ${className}();`);
  return { filename: `${className}.ts`, language: "typescript", code: lines.join("\n") };
}

function wdioLoc(c: { strategy: string; value: string }): string {
  const v = JSON.stringify(c.value);
  switch (c.strategy) {
    case "testid":      return `$(${JSON.stringify("[data-testid='" + c.value + "']")})`;
    case "role": {
      const m = c.value.match(/^([a-zA-Z]+)(?:\s+name=(.+))?$/);
      if (m) return m[2]
        ? `$(${JSON.stringify(`[role='${m[1]}']=${m[2].replace(/^['"]|['"]$/g, "")}`)})`
        : `$(${JSON.stringify("[role='" + m[1] + "']")})`;
      return `$(${v})`;
    }
    case "label":       return `$(${JSON.stringify("aria/" + c.value)}) /* WebdriverIO accessibility-name selector */`;
    case "placeholder": return `$(${JSON.stringify("[placeholder='" + c.value + "']")})`;
    case "text":        return `$(${v}).$(\`*=${c.value}\`)`;
    case "css":         return `$(${v})`;
    case "xpath":       return `$(${JSON.stringify(c.value.startsWith("//") ? c.value : "//" + c.value)})`;
    default:            return `$(${v})`;
  }
}

// ---- Selenium Java -----------------------------------------------------------

function seleniumJava(a: PageAnalysis, className: string): FrameworkOutput {
  const lines = [
    `import org.openqa.selenium.By;`,
    `import org.openqa.selenium.WebDriver;`,
    `import org.openqa.selenium.WebElement;`,
    "",
    `public class ${className} {`,
    `    private final WebDriver driver;`,
    `    public ${className}(WebDriver driver) { this.driver = driver; }`,
    "",
  ];
  for (const el of a.elements) {
    const top = el.locators[0];
    if (!top) continue;
    lines.push(`    /** ${escapeC(el.purpose)} */`);
    lines.push(`    public WebElement ${camel(el.alias)}() { return driver.findElement(${seleniumJavaBy(top)}); }`);
    lines.push("");
  }
  lines.push("}");
  return { filename: `${className}.java`, language: "java", code: lines.join("\n") };
}

function seleniumJavaBy(c: { strategy: string; value: string }): string {
  const j = (s: string) => JSON.stringify(s);
  switch (c.strategy) {
    case "testid":      return `By.cssSelector(${j("[data-testid='" + c.value + "']")})`;
    case "role": {
      const m = c.value.match(/^([a-zA-Z]+)(?:\s+name=(.+))?$/);
      if (m) {
        const role = m[1];
        const name = m[2]?.replace(/^['"]|['"]$/g, "") ?? "";
        return name
          ? `By.xpath(${j(`//*[@role='${role}' and (.='${name}' or @aria-label='${name}')]`)})`
          : `By.cssSelector(${j("[role='" + role + "']")})`;
      }
      return `By.cssSelector(${j(c.value)})`;
    }
    case "label":       return `By.xpath(${j(`//*[@aria-label='${c.value}']|//label[normalize-space()='${c.value}']/following::*[1]`)})`;
    case "placeholder": return `By.cssSelector(${j("[placeholder='" + c.value + "']")})`;
    case "text":        return `By.xpath(${j(`//*[contains(normalize-space(.), '${c.value}')]`)})`;
    case "css":         return `By.cssSelector(${j(c.value)})`;
    case "xpath":       return `By.xpath(${j(c.value)})`;
    default:            return `By.cssSelector(${j(c.value)})`;
  }
}

// ---- Selenium Python ---------------------------------------------------------

function seleniumPython(a: PageAnalysis, className: string): FrameworkOutput {
  const lines = [
    `from selenium.webdriver.common.by import By`,
    `from selenium.webdriver.remote.webdriver import WebDriver`,
    `from selenium.webdriver.remote.webelement import WebElement`,
    "",
    `class ${className}:`,
    `    def __init__(self, driver: WebDriver):`,
    `        self.driver = driver`,
    "",
  ];
  for (const el of a.elements) {
    const top = el.locators[0];
    if (!top) continue;
    lines.push(`    @property`);
    lines.push(`    def ${snake(el.alias)}(self) -> WebElement:`);
    lines.push(`        """${escapeC(el.purpose)}"""`);
    lines.push(`        return self.driver.find_element(${seleniumPyBy(top)})`);
    lines.push("");
  }
  return { filename: `${snake(className)}.py`, language: "python", code: lines.join("\n") };
}

function seleniumPyBy(c: { strategy: string; value: string }): string {
  switch (c.strategy) {
    case "testid":      return `By.CSS_SELECTOR, ${pyStr("[data-testid='" + c.value + "']")}`;
    case "role": {
      const m = c.value.match(/^([a-zA-Z]+)(?:\s+name=(.+))?$/);
      if (m) {
        const role = m[1];
        const name = m[2]?.replace(/^['"]|['"]$/g, "") ?? "";
        return name
          ? `By.XPATH, ${pyStr(`//*[@role='${role}' and (.='${name}' or @aria-label='${name}')]`)}`
          : `By.CSS_SELECTOR, ${pyStr("[role='" + role + "']")}`;
      }
      return `By.CSS_SELECTOR, ${pyStr(c.value)}`;
    }
    case "label":       return `By.XPATH, ${pyStr(`//*[@aria-label='${c.value}']|//label[normalize-space()='${c.value}']/following::*[1]`)}`;
    case "placeholder": return `By.CSS_SELECTOR, ${pyStr("[placeholder='" + c.value + "']")}`;
    case "text":        return `By.XPATH, ${pyStr(`//*[contains(normalize-space(.), '${c.value}')]`)}`;
    case "css":         return `By.CSS_SELECTOR, ${pyStr(c.value)}`;
    case "xpath":       return `By.XPATH, ${pyStr(c.value)}`;
    default:            return `By.CSS_SELECTOR, ${pyStr(c.value)}`;
  }
}

// ---- helpers -----------------------------------------------------------------

function pascal(s: string): string {
  const cleaned = s.replace(/[^a-zA-Z0-9]/g, "");
  return (cleaned[0]?.toUpperCase() + cleaned.slice(1)) || "Page";
}
function camel(s: string): string {
  const p = pascal(s);
  return p[0].toLowerCase() + p.slice(1);
}
function snake(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase().replace(/^_|_$/g, "");
}
function alias(s: string): string {
  let cleaned = s.replace(/[^a-zA-Z0-9]/g, "");
  cleaned = cleaned[0]?.toLowerCase() + cleaned.slice(1) || "el";
  return /^[0-9]/.test(cleaned) ? "_" + cleaned : cleaned;
}
function escapeC(s: string): string {
  return s.replace(/\*\//g, "*\\/").slice(0, 200);
}
function pyStr(s: string): string {
  // double-quoted Python string with backslash escaping
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}
