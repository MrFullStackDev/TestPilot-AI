import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trimDom } from "@/server/crawler/dom-trim";
import { callLLM } from "@/server/llm/router";
import { parseLlmJsonWithRetry } from "@/server/llm/json";
import { ANALYZE_SYSTEM, buildAnalyzeUserPrompt, PageAnalysisSchema } from "@/server/llm/prompts/analyzePage";
import { emitForFramework, FRAMEWORK_LABELS, type Framework } from "@/server/generator/frameworks";
import { runWithRequestKeys } from "@/server/llm/request-context";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  html: z.string().min(1).max(10 * 1024 * 1024),
  framework: z.enum(Object.keys(FRAMEWORK_LABELS) as [Framework, ...Framework[]]),
  url: z.string().optional(),
  pageNameHint: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { html, framework, url, pageNameHint } = parsed.data;

  const trimmed = trimDom(html);

  return runWithRequestKeys(req, async () => {
    let analysis;
    try {
      const userPrompt = buildAnalyzeUserPrompt({ url: url ?? "(pasted HTML)", trimmedDom: trimmed });
      const out = await parseLlmJsonWithRetry(
        (r) => callLLM(r, { tier: "cheap", purpose: "locator_gen" }),
        {
          system: ANALYZE_SYSTEM,
          cacheable: { system: true },
          messages: [{ role: "user", content: userPrompt }],
          jsonMode: true,
        },
      );
      analysis = PageAnalysisSchema.parse(out.value);
      if (pageNameHint) analysis.pageName = pageNameHint;
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
    }

    const out = emitForFramework(analysis, framework);
    return NextResponse.json({
      framework,
      filename: out.filename,
      language: out.language,
      code: out.code,
      analysis,
      distilled: trimmed,
      bytes: { input: Buffer.byteLength(html), distilled: Buffer.byteLength(trimmed) },
    });
  });
}
