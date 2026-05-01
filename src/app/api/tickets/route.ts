import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchLinearIssue, parseLinearId } from "@/server/integrations/linear";
import { fetchJiraIssue, parseJira } from "@/server/integrations/jira";
import { runWithRequestKeys, getIntegrationTokens } from "@/server/llm/request-context";

export const runtime = "nodejs";

const Body = z.object({
  source: z.enum(["jira", "linear", "auto"]).default("auto"),
  input: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  return runWithRequestKeys(req, async () => {
    try {
      const source = parsed.data.source === "auto" ? detect(parsed.data.input) : parsed.data.source;
      if (source === "linear") {
        const issue = await fetchLinearIssue(parsed.data.input);
        return NextResponse.json({ source: "linear", issue });
      }
      if (source === "jira") {
        const issue = await fetchJiraIssue(parsed.data.input);
        return NextResponse.json({ source: "jira", issue });
      }
      return NextResponse.json({ error: "could not detect ticket source" }, { status: 400 });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? String(e) }, { status: 400 });
    }
  });
}

function detect(input: string): "jira" | "linear" | "auto" {
  if (parseLinearId(input)) {
    // Plain TEAM-123 is ambiguous between Jira and Linear. Prefer Linear if we
    // have a Linear token, else Jira if we have Jira config. URL hints win.
    const hasLinear = !!getIntegrationTokens().linearToken;
    const hasJira = !!getIntegrationTokens().jiraToken;
    try {
      const u = new URL(input);
      if (u.hostname.includes("linear.app")) return "linear";
      if (u.hostname.includes("atlassian.net")) return "jira";
    } catch {}
    if (hasLinear && !hasJira) return "linear";
    if (hasJira && !hasLinear) return "jira";
    if (hasLinear) return "linear";
    if (hasJira) return "jira";
  }
  return "auto";
}
