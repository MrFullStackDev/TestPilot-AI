import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parsePlaywrightJson } from "../src/server/runner/parse-results";

function tmpJson(content: any): string {
  const f = path.join(os.tmpdir(), `pw-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(f, JSON.stringify(content));
  return f;
}

describe("parsePlaywrightJson", () => {
  it("handles errors[] (modern reporter)", () => {
    const f = tmpJson({
      suites: [{ specs: [{ title: "demo", tests: [{ results: [{
        status: "failed",
        duration: 123,
        errors: [{ message: "Locator: getByTestId('x') -> not found" }],
      }] }] }] }],
    });
    const out = parsePlaywrightJson(f);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("failed");
    expect(out[0].error).toContain("Locator: getByTestId('x')");
  });

  it("falls back to single error (legacy reporter)", () => {
    const f = tmpJson({
      suites: [{ specs: [{ title: "demo", tests: [{ results: [{ status: "failed", error: { message: "old style" } }] }] }] }],
    });
    const out = parsePlaywrightJson(f);
    expect(out[0].error).toBe("old style");
  });

  it("joins multiple errors with separator", () => {
    const f = tmpJson({
      suites: [{ specs: [{ title: "demo", tests: [{ results: [{
        status: "failed",
        errors: [{ message: "first" }, { message: "second" }],
      }] }] }] }],
    });
    const out = parsePlaywrightJson(f);
    expect(out[0].error).toBe("first\n---\nsecond");
  });

  it("returns null error on passed", () => {
    const f = tmpJson({ suites: [{ specs: [{ title: "demo", tests: [{ results: [{ status: "passed", duration: 10 }] }] }] }] });
    expect(parsePlaywrightJson(f)[0].error).toBeNull();
  });
});
