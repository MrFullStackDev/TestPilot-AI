import { describe, it, expect } from "vitest";
import { runWithRequestKeys, getRequestKey, getIntegrationTokens } from "../src/server/llm/request-context";

function fakeReq(headers: Record<string, string>): Request {
  return new Request("http://localhost/test", { headers });
}

describe("BYOK request context", () => {
  it("threads provider keys + integration tokens into nested calls", async () => {
    const req = fakeReq({
      "x-ai-provider-key-anthropic": "sk-ant-XXX",
      "x-ai-provider-key-openai": "sk-XXX",
      "x-jira-email": "alice@example.com",
      "x-jira-token": "ATATT-x",
      "x-jira-base-url": "https://acme.atlassian.net",
      "x-linear-token": "lin_api_x",
    });

    await runWithRequestKeys(req, async () => {
      // Some made-up nested function to verify ALS propagation.
      const nested = async () => {
        return {
          a: getRequestKey("anthropic"),
          o: getRequestKey("openai"),
          g: getRequestKey("google"),
          tokens: getIntegrationTokens(),
        };
      };
      const r = await nested();
      expect(r.a).toBe("sk-ant-XXX");
      expect(r.o).toBe("sk-XXX");
      expect(r.g).toBeUndefined();
      expect(r.tokens.jiraEmail).toBe("alice@example.com");
      expect(r.tokens.jiraToken).toBe("ATATT-x");
      expect(r.tokens.jiraBaseUrl).toBe("https://acme.atlassian.net");
      expect(r.tokens.linearToken).toBe("lin_api_x");
    });
  });

  it("isolates concurrent contexts", async () => {
    const a = runWithRequestKeys(fakeReq({ "x-ai-provider-key-anthropic": "A" }), async () => {
      await new Promise((r) => setTimeout(r, 30));
      return getRequestKey("anthropic");
    });
    const b = runWithRequestKeys(fakeReq({ "x-ai-provider-key-anthropic": "B" }), async () => {
      await new Promise((r) => setTimeout(r, 10));
      return getRequestKey("anthropic");
    });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe("A");
    expect(rb).toBe("B");
  });

  it("returns empty when called outside a request context", () => {
    expect(getRequestKey("anthropic")).toBeUndefined();
    expect(getIntegrationTokens()).toEqual({});
  });
});
