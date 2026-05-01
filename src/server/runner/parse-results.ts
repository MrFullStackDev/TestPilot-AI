// Parse Playwright JSON reporter output.
// See https://playwright.dev/docs/test-reporters#json-reporter
// Newer versions emit `errors: TestError[]`; older ones emit a single `error`.

import fs from "node:fs";

export type ParsedResult = {
  test_name: string;
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted" | "unknown";
  duration_ms: number | null;
  error: string | null;
  file: string | null;
};

export function parsePlaywrightJson(path: string): ParsedResult[] {
  if (!fs.existsSync(path)) return [];
  const raw = JSON.parse(fs.readFileSync(path, "utf8"));
  const out: ParsedResult[] = [];
  for (const suite of raw.suites ?? []) walkSuite(suite, "", out);
  return out;
}

function walkSuite(suite: any, prefix: string, out: ParsedResult[]) {
  const file = suite.file ?? null;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const name = `${prefix}${prefix ? " > " : ""}${spec.title}`;
      const lastResult = (test.results ?? []).at(-1);
      out.push({
        test_name: name,
        status: lastResult?.status ?? "unknown",
        duration_ms: lastResult?.duration ?? null,
        error: extractError(lastResult),
        file,
      });
    }
  }
  for (const child of suite.suites ?? []) walkSuite(child, `${prefix}${prefix ? " > " : ""}${child.title ?? ""}`, out);
}

function extractError(result: any): string | null {
  if (!result) return null;
  // 1. Modern: result.errors[]
  const arr = Array.isArray(result.errors) ? result.errors : [];
  if (arr.length > 0) {
    return arr.map((e: any) => e?.message ?? e?.value ?? "").filter(Boolean).join("\n---\n") || null;
  }
  // 2. Legacy single error
  const single = result.error;
  if (single) return single.message ?? single.value ?? null;
  // 3. errors on the test itself (some reporters emit it there)
  return null;
}
