import fs from "node:fs";
import path from "node:path";
import { slugify } from "@/lib/utils";
import {
  packageJsonTemplate,
  playwrightConfigTemplate,
  tsconfigTemplate,
  envExampleTemplate,
  readmeTemplate,
  gitignoreTemplate,
  authPlaceholder,
} from "./templates";
import { emitPageObject } from "./emit-page-object";
import { emitSpec } from "./emit-spec";
import type { PageAnalysis } from "@/server/llm/prompts/analyzePage";
import type { TestPlan } from "@/server/llm/prompts/generateTests";

export type EmitInput = {
  outDir: string;
  projectName: string;
  projectSlug: string;
  baseURL: string;
  pageObjectsByName: Record<string, PageAnalysis>;
  pageUrlByName?: Record<string, string>; // captured URL the analysis came from
  plan: TestPlan;
};

export type EmittedTest = {
  name: string;
  feature: string;
  filePath: string;
  pageObjectPath: string | null;
  locatorMeta: unknown;
  pageUrl: string | null;
  primaryLocatorKey: string | null;
};

export type EmitResult = {
  outDir: string;
  files: string[];
  tests: EmittedTest[];
  warnings: string[];
};

export function emitProject(input: EmitInput): EmitResult {
  const { outDir, projectName, projectSlug, baseURL, pageObjectsByName, plan } = input;
  const pageUrlByName = input.pageUrlByName ?? {};

  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];

  function w(rel: string, content: string) {
    const full = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    files.push(rel);
  }

  // scaffold
  w("package.json", packageJsonTemplate(projectSlug));
  w("playwright.config.ts", playwrightConfigTemplate(baseURL));
  w("tsconfig.json", tsconfigTemplate);
  w(".env.example", envExampleTemplate);
  w(".gitignore", gitignoreTemplate);
  w("README.md", readmeTemplate(projectName, projectSlug));
  w(".auth/state.json", authPlaceholder);

  // page objects
  const pageObjectFiles: Record<string, string> = {};
  for (const [name, analysis] of Object.entries(pageObjectsByName)) {
    const { className, code } = emitPageObject(analysis);
    const rel = `page-objects/${className}.ts`;
    w(rel, code + "\n");
    pageObjectFiles[name] = rel;
  }

  // specs (one file per feature group)
  const byFeature: Record<string, typeof plan.cases> = {};
  for (const c of plan.cases) {
    const feat = slugify(c.feature || "general") || "general";
    (byFeature[feat] ??= []).push(c);
  }

  const allWarnings: string[] = [];
  const emittedTests: EmittedTest[] = [];

  // Filter out cases that reference unknown page objects or aliases. The plan
  // calls for biasing toward fewer-but-correct tests over many-broken ones.
  for (const [feature, cases] of Object.entries(byFeature)) {
    byFeature[feature] = cases.filter((c) => {
      for (const s of c.steps) {
        if ("pageObject" in s && s.pageObject) {
          const po = pageObjectsByName[s.pageObject];
          if (!po) { allWarnings.push(`drop case "${c.name}": unknown pageObject ${s.pageObject}`); return false; }
          if ("alias" in s) {
            const found = po.elements.some((e) => e.alias === s.alias);
            if (!found) { allWarnings.push(`drop case "${c.name}": unknown alias ${s.pageObject}.${s.alias}`); return false; }
          }
        }
      }
      return true;
    });
  }

  for (const [feature, cases] of Object.entries(byFeature)) {
    if (cases.length === 0) continue;
    const lines: string[] = [];
    const usedPOs = new Set<string>();
    for (const c of cases) for (const s of c.steps) if ("pageObject" in s && s.pageObject) usedPOs.add(s.pageObject);

    // imports
    lines.push(`import { test, expect } from "@playwright/test";`);
    for (const poName of usedPOs) {
      const cls = pascal(poName);
      lines.push(`import { ${cls} } from "../page-objects/${cls}";`);
    }
    lines.push("");

    for (const c of cases) {
      const { code, warnings } = emitSpec({
        testCase: c,
        pageObjectsByName,
        importPath: (cls) => `../page-objects/${cls}`,
      });
      // strip duplicate imports — emitSpec re-imports per case; we’ve hoisted imports above.
      const stripped = code.split("\n").filter((l) => !l.startsWith("import ")).join("\n").trim();
      lines.push(stripped + "\n");
      allWarnings.push(...warnings);

      const filePath = `tests/${feature}.spec.ts`;
      const firstPoStep = c.steps.find((s) => "pageObject" in s) as { pageObject: string; alias: string } | undefined;
      const pageObjectPath = firstPoStep ? pageObjectFiles[firstPoStep.pageObject] ?? null : null;
      const primaryLocatorKey = firstPoStep ? `${firstPoStep.pageObject}.${firstPoStep.alias}` : null;
      // page URL: prefer the first goto in the test, else fall back to the page-object's source URL.
      const firstGoto = c.steps.find((s) => s.action === "goto") as { url: string } | undefined;
      const pageUrl = firstGoto?.url ?? (firstPoStep ? pageUrlByName[firstPoStep.pageObject] ?? null : null);
      const locatorMeta: Record<string, any> = {};
      for (const s of c.steps) {
        if ("pageObject" in s && "alias" in s) {
          const po = pageObjectsByName[s.pageObject];
          const el = po?.elements.find((e) => e.alias === s.alias);
          if (el) locatorMeta[`${s.pageObject}.${s.alias}`] = el.locators;
        }
      }
      emittedTests.push({ name: c.name, feature, filePath, pageObjectPath, locatorMeta, pageUrl, primaryLocatorKey });
    }

    w(`tests/${feature}.spec.ts`, lines.join("\n"));
  }

  // .testgen/locators.json — flat lookup for the healer
  const flatLocators: Record<string, any> = {};
  for (const [poName, analysis] of Object.entries(pageObjectsByName)) {
    for (const el of analysis.elements) flatLocators[`${poName}.${el.alias}`] = el.locators;
  }
  w(".testgen/locators.json", JSON.stringify(flatLocators, null, 2));
  w(".testgen/page-objects.json", JSON.stringify(pageObjectsByName, null, 2));

  return { outDir, files, tests: emittedTests, warnings: allWarnings };
}

function pascal(s: string): string {
  const cleaned = s.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned[0]?.toUpperCase() + cleaned.slice(1) || "Page";
}
