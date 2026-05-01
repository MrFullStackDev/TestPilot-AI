import { describe, it, expect } from "vitest";
import { parseLinearId } from "../src/server/integrations/linear";
import { parseJira } from "../src/server/integrations/jira";

describe("parseLinearId", () => {
  it("accepts plain TEAM-123 keys", () => {
    expect(parseLinearId("ABC-123")).toBe("ABC-123");
    expect(parseLinearId("abc-123")).toBe("ABC-123");
    expect(parseLinearId("FOO-9876")).toBe("FOO-9876");
  });

  it("extracts from a Linear URL", () => {
    expect(parseLinearId("https://linear.app/acme/issue/ENG-42/title-slug")).toBe("ENG-42");
  });

  it("rejects junk", () => {
    expect(parseLinearId("not a key")).toBeNull();
    expect(parseLinearId("https://example.com/")).toBeNull();
  });
});

describe("parseJira", () => {
  const base = "https://acme.atlassian.net";

  it("accepts plain keys with the configured base", () => {
    expect(parseJira("ABC-1", base)).toEqual({ key: "ABC-1", base });
  });

  it("extracts from a Jira URL and uses its host as the base", () => {
    const out = parseJira("https://other.atlassian.net/browse/QA-7", base);
    expect(out.key).toBe("QA-7");
    expect(out.base).toBe("https://other.atlassian.net");
  });

  it("rejects junk", () => {
    expect(parseJira("nope", base).key).toBeNull();
  });
});
