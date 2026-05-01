import type { PageAnalysis } from "@/server/llm/prompts/analyzePage";

// Emit a Playwright page-object class from an analysis. Each element becomes
// a getter that resolves to a Locator using the FIRST candidate strategy.
// All candidates are saved alongside in `locators.json` for the healer.

function locatorExpr(strategy: string, value: string): string {
  // value may already include modifiers like "button name=Submit" for role.
  const v = JSON.stringify(value);
  switch (strategy) {
    case "testid":
      return `this.page.getByTestId(${v})`;
    case "role": {
      // "button name=Submit" → role=button, name="Submit"
      const m = value.match(/^([a-zA-Z]+)(?:\s+name=(.+))?$/);
      if (m) {
        const role = JSON.stringify(m[1]);
        if (m[2]) return `this.page.getByRole(${role}, { name: ${JSON.stringify(m[2].replace(/^['"]|['"]$/g, ""))} })`;
        return `this.page.getByRole(${role})`;
      }
      return `this.page.getByRole(${v} as any)`;
    }
    case "label":
      return `this.page.getByLabel(${v})`;
    case "text":
      return `this.page.getByText(${v}, { exact: false })`;
    case "placeholder":
      return `this.page.getByPlaceholder(${v})`;
    case "css":
      return `this.page.locator(${v})`;
    case "xpath":
      // Concatenate at runtime so a malicious value with backticks/${...} can't break out of a template literal.
      return `this.page.locator(${JSON.stringify("xpath=" + value)})`;
    default:
      return `this.page.locator(${v})`;
  }
}

export function emitPageObject(analysis: PageAnalysis): { className: string; code: string } {
  const className = sanitiseClass(analysis.pageName);
  const lines: string[] = [];
  lines.push(`import type { Page, Locator } from "@playwright/test";`);
  lines.push("");
  lines.push(`export class ${className} {`);
  lines.push(`  constructor(public readonly page: Page) {}`);
  lines.push("");
  for (const el of analysis.elements) {
    const top = el.locators[0];
    if (!top) continue;
    const expr = locatorExpr(top.strategy, top.value);
    lines.push(`  /** ${escapeComment(el.purpose)} */`);
    lines.push(`  get ${sanitiseAlias(el.alias)}(): Locator { return ${expr}; }`);
    lines.push("");
  }
  lines.push("}");
  return { className, code: lines.join("\n") };
}

function sanitiseClass(s: string): string {
  const cleaned = s.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned[0]?.toUpperCase() + cleaned.slice(1) || "Page";
}

function sanitiseAlias(s: string): string {
  let cleaned = s.replace(/[^a-zA-Z0-9]/g, "");
  cleaned = cleaned[0]?.toLowerCase() + cleaned.slice(1) || "el";
  if (/^[0-9]/.test(cleaned)) cleaned = "_" + cleaned;
  const reserved = new Set(["class", "page", "locator", "constructor", "default"]);
  return reserved.has(cleaned) ? cleaned + "_" : cleaned;
}

function escapeComment(s: string): string {
  return s.replace(/\*\//g, "*\\/").slice(0, 200);
}
