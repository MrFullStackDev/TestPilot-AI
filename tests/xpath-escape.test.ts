import { describe, it, expect } from "vitest";
import { emitPageObject } from "../src/server/generator/emit-page-object";
import type { PageAnalysis } from "../src/server/llm/prompts/analyzePage";

// What we're asserting: a hostile xpath value cannot be emitted as a template
// literal where it would be parsed as JS by the TS compiler when the spec is
// loaded by Playwright. The fix: render xpath via JSON.stringify into a
// double-quoted string literal, where backticks and ${...} have no syntactic
// meaning at parse time.

describe("xpath emit is template-literal-safe", () => {
  function emit(value: string) {
    const a: PageAnalysis = {
      pageName: "P",
      elements: [{ alias: "x", purpose: "x", kind: "other", locators: [{ strategy: "xpath", value }] }],
      observations: [],
    };
    return emitPageObject(a).code;
  }

  it("never opens a template literal around the xpath argument", () => {
    const code = emit("//foo`+process.exit(1)+`");
    // No backtick string used to wrap the xpath= prefix anywhere
    expect(code).not.toMatch(/locator\(`/);
    // The locator call must use a double-quoted string literal
    expect(code).toMatch(/this\.page\.locator\(".+"\)/);
  });

  it("escapes a backtick-laden value into a JSON string", () => {
    const code = emit("//foo`bar");
    // The value appears inside a double-quoted string, where backtick is just a literal char.
    expect(code).toContain('this.page.locator("xpath=//foo`bar")');
    // JSON.stringify(value) is also valid as a JS double-quoted literal — that's the safety margin.
    expect(code.includes(JSON.stringify("xpath=//foo`bar"))).toBe(true);
  });

  it("escapes a ${...} interpolation breakout into a literal", () => {
    const code = emit("//bar${global.process.exit(1)}");
    // Must not produce a template substitution that the TS parser would evaluate.
    expect(code).not.toMatch(/`[^`]*\$\{/);
    // The whole ${...} must appear as plain text inside double quotes.
    expect(code).toContain('this.page.locator("xpath=//bar${global.process.exit(1)}")');
  });

  it("plain xpath values still resolve at runtime", () => {
    const code = emit("//div[@id='ok']");
    expect(code).toContain(`this.page.locator("xpath=//div[@id='ok']")`);
  });
});
