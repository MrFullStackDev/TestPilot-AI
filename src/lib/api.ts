// Frontend fetch wrapper that injects BYOK provider keys + Jira/Linear tokens
// from localStorage as request headers. The settings page is the only writer
// to localStorage; everywhere else just calls apiFetch.

const STORAGE_KEY = "ai-test-gen.byok";

export type ByokStore = {
  keys: { anthropic?: string; openai?: string; google?: string };
  integrations: {
    jiraEmail?: string;
    jiraToken?: string;
    jiraBaseUrl?: string;
    linearToken?: string;
  };
};

export function readByok(): ByokStore {
  if (typeof window === "undefined") return { keys: {}, integrations: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { keys: {}, integrations: {} };
    const parsed = JSON.parse(raw);
    return {
      keys: parsed.keys ?? {},
      integrations: parsed.integrations ?? {},
    };
  } catch {
    return { keys: {}, integrations: {} };
  }
}

export function writeByok(next: ByokStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearByok() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function byokHeaders(): Record<string, string> {
  const s = readByok();
  const headers: Record<string, string> = {};
  if (s.keys.anthropic) headers["x-ai-provider-key-anthropic"] = s.keys.anthropic;
  if (s.keys.openai)    headers["x-ai-provider-key-openai"] = s.keys.openai;
  if (s.keys.google)    headers["x-ai-provider-key-google"] = s.keys.google;
  if (s.integrations.jiraEmail)   headers["x-jira-email"] = s.integrations.jiraEmail;
  if (s.integrations.jiraToken)   headers["x-jira-token"] = s.integrations.jiraToken;
  if (s.integrations.jiraBaseUrl) headers["x-jira-base-url"] = s.integrations.jiraBaseUrl;
  if (s.integrations.linearToken) headers["x-linear-token"] = s.integrations.linearToken;
  return headers;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  for (const [k, v] of Object.entries(byokHeaders())) headers.set(k, v);
  return fetch(input, { ...init, headers });
}
