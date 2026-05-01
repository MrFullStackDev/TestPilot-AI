// Linear ticket fetcher. Tokens come from per-request headers (BYOK).
import { getIntegrationTokens } from "@/server/llm/request-context";

export type LinearIssue = {
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  state: string;
  priority: number | null;
  team: string;
  assignee: string | null;
};

const QUERY = `query Issue($id: String!) {
  issue(id: $id) {
    identifier
    title
    description
    url
    state { name }
    priority
    team { name }
    assignee { name }
  }
}`;

export async function fetchLinearIssue(idOrUrl: string): Promise<LinearIssue> {
  const id = parseLinearId(idOrUrl);
  if (!id) throw new Error("could not extract Linear issue id from input");
  const { linearToken } = getIntegrationTokens();
  if (!linearToken) throw new Error("no Linear token configured (Settings → Integrations)");

  const r = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: linearToken },
    body: JSON.stringify({ query: QUERY, variables: { id } }),
  });
  if (!r.ok) throw new Error(`Linear API ${r.status}: ${await r.text().catch(() => "")}`);
  const j = await r.json();
  if (j.errors?.length) throw new Error(`Linear: ${j.errors[0].message}`);
  const issue = j.data?.issue;
  if (!issue) throw new Error(`Linear: issue ${id} not found`);
  return {
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    url: issue.url,
    state: issue.state?.name ?? "",
    priority: issue.priority,
    team: issue.team?.name ?? "",
    assignee: issue.assignee?.name ?? null,
  };
}

export function parseLinearId(input: string): string | null {
  const trimmed = input.trim();
  // Direct identifier (TEAM-123)
  if (/^[A-Za-z]+-\d+$/.test(trimmed)) return trimmed.toUpperCase();
  try {
    const u = new URL(trimmed);
    // https://linear.app/team/issue/ABC-123/title-slug
    const m = u.pathname.match(/issue\/([A-Za-z]+-\d+)/);
    if (m) return m[1].toUpperCase();
  } catch {}
  return null;
}
