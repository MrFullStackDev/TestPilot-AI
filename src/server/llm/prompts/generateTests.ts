// Cross-page test plan generation. Default model.

import { z } from "zod";
import type { PageAnalysis } from "./analyzePage";

export const TestStepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("goto"), url: z.string() }),
  z.object({ action: z.literal("click"), pageObject: z.string(), alias: z.string() }),
  z.object({ action: z.literal("fill"), pageObject: z.string(), alias: z.string(), value: z.string() }),
  z.object({ action: z.literal("select"), pageObject: z.string(), alias: z.string(), value: z.string() }),
  z.object({ action: z.literal("expect_visible"), pageObject: z.string(), alias: z.string() }),
  z.object({ action: z.literal("expect_text"), pageObject: z.string(), alias: z.string(), text: z.string() }),
  z.object({ action: z.literal("expect_url"), pattern: z.string() }),
  z.object({ action: z.literal("wait"), ms: z.number().int().min(0).max(5000) }),
]);

export const TestCaseSchema = z.object({
  name: z.string().describe("descriptive test name"),
  feature: z.string().describe("logical group, e.g. 'auth', 'checkout', 'navigation'"),
  description: z.string().optional(),
  steps: z.array(TestStepSchema).min(1),
});

export const TestPlanSchema = z.object({
  cases: z.array(TestCaseSchema).min(1),
});

export type TestPlan = z.infer<typeof TestPlanSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;

export const GENERATE_SYSTEM = `You write Playwright test PLANS as JSON. You do not write code.

Constraints:
- Bias toward USER-VISIBLE assertions. Prefer expect_visible / expect_text / expect_url over implementation details.
- Include happy-path and one or two edge cases per major flow.
- Every step must reference an alias from the provided page-object analyses (except 'goto', 'expect_url', 'wait').
- Test names: short, behaviour-focused (e.g. "user can submit search form").
- DO NOT invent aliases that aren't in the page objects.
- Output JSON only, no code, no fences.`;

export function buildGenerateUserPrompt(input: {
  rootUrl: string;
  siteProfile?: unknown;
  pages: Array<{ url: string; analysis: PageAnalysis }>;
}): string {
  const profile = input.siteProfile ? `\nSITE PROFILE:\n${JSON.stringify(input.siteProfile, null, 2)}\n` : "";
  const pagesBlock = input.pages
    .map((p) => `--- ${p.url} ---\n${JSON.stringify(p.analysis, null, 2)}`)
    .join("\n\n");
  return `Root URL: ${input.rootUrl}${profile}

PAGE OBJECTS (from analysis):
${pagesBlock}

Return JSON:
{
  "cases": [{
    "name": "string",
    "feature": "string",
    "description": "string",
    "steps": [
      { "action": "goto", "url": "string" } |
      { "action": "click", "pageObject": "string", "alias": "string" } |
      { "action": "fill", "pageObject": "string", "alias": "string", "value": "string" } |
      { "action": "select", "pageObject": "string", "alias": "string", "value": "string" } |
      { "action": "expect_visible", "pageObject": "string", "alias": "string" } |
      { "action": "expect_text", "pageObject": "string", "alias": "string", "text": "string" } |
      { "action": "expect_url", "pattern": "string (substring or regex)" } |
      { "action": "wait", "ms": number }
    ]
  }]
}`;
}
