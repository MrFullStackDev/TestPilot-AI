// AsyncLocalStorage threads request-scoped per-provider keys + integration tokens
// from API headers down into deeply nested LLM/integration calls without touching
// every signature. Used for BYOK and per-request Jira/Linear tokens.

import { AsyncLocalStorage } from "node:async_hooks";
import type { Provider } from "./types";

export type RequestKeys = Partial<Record<Provider, string>>;
export type IntegrationTokens = {
  jiraEmail?: string;
  jiraToken?: string;
  jiraBaseUrl?: string;
  linearToken?: string;
};

export type RequestCtx = { keys: RequestKeys; integrations: IntegrationTokens };

const als = new AsyncLocalStorage<RequestCtx>();

export function runWithRequestKeys<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  const h = req.headers;
  const ctx: RequestCtx = {
    keys: {
      anthropic: h.get("x-ai-provider-key-anthropic") ?? undefined,
      openai:    h.get("x-ai-provider-key-openai") ?? undefined,
      google:    h.get("x-ai-provider-key-google") ?? undefined,
    },
    integrations: {
      jiraEmail: h.get("x-jira-email") ?? undefined,
      jiraToken: h.get("x-jira-token") ?? undefined,
      jiraBaseUrl: h.get("x-jira-base-url") ?? undefined,
      linearToken: h.get("x-linear-token") ?? undefined,
    },
  };
  return als.run(ctx, fn);
}

export function getRequestKey(provider: Provider): string | undefined {
  return als.getStore()?.keys[provider];
}

export function getIntegrationTokens(): IntegrationTokens {
  return als.getStore()?.integrations ?? {};
}
