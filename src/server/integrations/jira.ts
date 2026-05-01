// Jira ticket fetcher. Tokens + base URL come from per-request headers (BYOK).
import { getIntegrationTokens } from "@/server/llm/request-context";

export type JiraIssue = {
  key: string;
  summary: string;
  description: string;
  url: string;
  status: string;
  type: string;
  priority: string | null;
  assignee: string | null;
};

export async function fetchJiraIssue(input: string): Promise<JiraIssue> {
  const { jiraEmail, jiraToken, jiraBaseUrl } = getIntegrationTokens();
  if (!jiraToken || !jiraEmail || !jiraBaseUrl) {
    throw new Error("Jira not configured (Settings → Integrations: base URL, email, token)");
  }
  const { key, base } = parseJira(input, jiraBaseUrl);
  if (!key) throw new Error("could not extract Jira key from input");

  const auth = "Basic " + Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64");
  const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}`, {
    headers: { authorization: auth, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`Jira API ${r.status}: ${await r.text().catch(() => "")}`);
  const j = await r.json();
  return {
    key: j.key,
    summary: j.fields?.summary ?? "",
    description: adfToText(j.fields?.description),
    url: `${base}/browse/${j.key}`,
    status: j.fields?.status?.name ?? "",
    type: j.fields?.issuetype?.name ?? "",
    priority: j.fields?.priority?.name ?? null,
    assignee: j.fields?.assignee?.displayName ?? null,
  };
}

export function parseJira(input: string, configuredBase: string): { key: string | null; base: string } {
  const trimmed = input.trim();
  if (/^[A-Za-z]+-\d+$/.test(trimmed)) return { key: trimmed.toUpperCase(), base: configuredBase };
  try {
    const u = new URL(trimmed);
    const m = u.pathname.match(/browse\/([A-Za-z]+-\d+)/);
    if (m) return { key: m[1].toUpperCase(), base: `${u.protocol}//${u.host}` };
  } catch {}
  return { key: null, base: configuredBase };
}

// Atlassian Document Format → plain text. We don't need the full grammar — just
// flatten textNodes recursively so the LLM sees readable description content.
function adfToText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToText).join("");
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  let inner = "";
  if (Array.isArray(node.content)) inner = node.content.map(adfToText).join("");
  switch (node.type) {
    case "paragraph":   return inner + "\n";
    case "heading":     return inner + "\n";
    case "bulletList":  return inner;
    case "orderedList": return inner;
    case "listItem":    return "- " + inner.trim() + "\n";
    case "codeBlock":   return "```\n" + inner + "\n```\n";
    default:            return inner;
  }
}
