import type { TestCase } from "@/server/llm/prompts/generateTests";
import type { PageAnalysis } from "@/server/llm/prompts/analyzePage";

// Emit a Playwright spec for a single test case.
// Page-object aliases must exist in `pageObjects` (PageAnalysis keyed by pageName).

export function emitSpec(input: {
  testCase: TestCase;
  pageObjectsByName: Record<string, PageAnalysis>;
  importPath: (className: string) => string;
}): { code: string; warnings: string[] } {
  const { testCase, pageObjectsByName, importPath } = input;
  const warnings: string[] = [];
  const usedPageObjects = new Set<string>();

  const lines: string[] = [];
  for (const step of testCase.steps) {
    if ("pageObject" in step && step.pageObject) usedPageObjects.add(step.pageObject);
  }

  // imports
  const imports: string[] = [`import { test, expect } from "@poslayer/test";`];
  imports[0] = `import { test, expect } from "@playwright/test";`;
  for (const poName of usedPageObjects) {
    const cls = pascal(poName);
    imports.push(`import { ${cls} } from "${importPath(cls)}";`);
  }

  // body
  lines.push(...imports);
  lines.push("");
  lines.push(`test(${JSON.stringify(testCase.name)}, async ({ page }) => {`);
  for (const poName of usedPageObjects) {
    const cls = pascal(poName);
    lines.push(`  const ${camel(cls)} = new ${cls}(page);`);
  }
  for (let i = 0; i < testCase.steps.length; i++) {
    const step = testCase.steps[i];
    lines.push("  " + emitStepLine(step, pageObjectsByName, warnings));
    // After interactions that commonly trigger navigation/network, wait for the
    // page to settle before the next step. Avoids flaky CI runs where the next
    // assertion races a pending re-render.
    if (shouldWaitAfter(step, testCase.steps[i + 1])) {
      lines.push(`  await page.waitForLoadState("networkidle").catch(() => {});`);
    }
  }
  lines.push("});");
  lines.push("");

  return { code: lines.join("\n"), warnings };
}

// Insert a settle-wait after an interaction step if the *next* step is an
// assertion that depends on the page being stable (URL/text/visibility).
// We don't wait after every click — that would slow down pure-form sequences.
function shouldWaitAfter(step: TestCase["steps"][number], next: TestCase["steps"][number] | undefined): boolean {
  if (!next) return false;
  const triggersNav = step.action === "click" || step.action === "goto";
  const nextIsAssert =
    next.action === "expect_url" ||
    next.action === "expect_visible" ||
    next.action === "expect_text";
  return triggersNav && nextIsAssert;
}

function emitStepLine(step: TestCase["steps"][number], pageObjectsByName: Record<string, PageAnalysis>, warnings: string[]): string {
  switch (step.action) {
    case "goto":
      return `await page.goto(${JSON.stringify(step.url)});`;
    case "click": {
      const ok = checkAlias(step, pageObjectsByName, warnings);
      return ok ? `await ${camel(pascal(step.pageObject))}.${alias(step.alias)}.click();` : `// SKIP: missing alias ${step.pageObject}.${step.alias}`;
    }
    case "fill": {
      const ok = checkAlias(step, pageObjectsByName, warnings);
      return ok ? `await ${camel(pascal(step.pageObject))}.${alias(step.alias)}.fill(${JSON.stringify(step.value)});` : `// SKIP: missing alias ${step.pageObject}.${step.alias}`;
    }
    case "select": {
      const ok = checkAlias(step, pageObjectsByName, warnings);
      return ok ? `await ${camel(pascal(step.pageObject))}.${alias(step.alias)}.selectOption(${JSON.stringify(step.value)});` : `// SKIP: missing alias ${step.pageObject}.${step.alias}`;
    }
    case "expect_visible": {
      const ok = checkAlias(step, pageObjectsByName, warnings);
      return ok ? `await expect(${camel(pascal(step.pageObject))}.${alias(step.alias)}).toBeVisible();` : `// SKIP: missing alias ${step.pageObject}.${step.alias}`;
    }
    case "expect_text": {
      const ok = checkAlias(step, pageObjectsByName, warnings);
      return ok ? `await expect(${camel(pascal(step.pageObject))}.${alias(step.alias)}).toContainText(${JSON.stringify(step.text)});` : `// SKIP: missing alias ${step.pageObject}.${step.alias}`;
    }
    case "expect_url":
      return `await expect(page).toHaveURL(${JSON.stringify(step.pattern)});`;
    case "wait":
      return `await page.waitForTimeout(${step.ms});`;
  }
}

function checkAlias(step: { pageObject: string; alias: string }, pageObjectsByName: Record<string, PageAnalysis>, warnings: string[]): boolean {
  const po = pageObjectsByName[step.pageObject];
  if (!po) { warnings.push(`unknown pageObject: ${step.pageObject}`); return false; }
  const found = po.elements.some((e) => e.alias === step.alias);
  if (!found) warnings.push(`unknown alias on ${step.pageObject}: ${step.alias}`);
  return found;
}

function pascal(s: string): string {
  const cleaned = s.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned[0]?.toUpperCase() + cleaned.slice(1) || "Page";
}

function camel(s: string): string {
  return s[0]?.toLowerCase() + s.slice(1) || s;
}

function alias(s: string): string {
  let cleaned = s.replace(/[^a-zA-Z0-9]/g, "");
  cleaned = cleaned[0]?.toLowerCase() + cleaned.slice(1) || "el";
  return /^[0-9]/.test(cleaned) ? "_" + cleaned : cleaned;
}
