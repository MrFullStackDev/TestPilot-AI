import { describe, it, expect } from "vitest";
import { canonicalUrl, formatDuration, formatRelative } from "../src/lib/utils";

describe("canonicalUrl", () => {
  it("strips trailing slashes from the path (but keeps a single root '/')", () => {
    expect(canonicalUrl("https://example.com/foo/")).toBe("https://example.com/foo");
    expect(canonicalUrl("https://example.com/")).toBe("https://example.com/");
    expect(canonicalUrl("https://example.com")).toBe("https://example.com/");
  });
  it("drops fragments", () => {
    expect(canonicalUrl("https://example.com/#anchor")).toBe("https://example.com/");
  });
  it("lowercases host", () => {
    expect(canonicalUrl("https://EXAMPLE.COM/")).toBe("https://example.com/");
  });
  it("strips default ports", () => {
    expect(canonicalUrl("https://example.com:443/x")).toBe("https://example.com/x");
    expect(canonicalUrl("http://example.com:80/x")).toBe("http://example.com/x");
  });
  it("returns input on parse failure", () => {
    expect(canonicalUrl("not a url")).toBe("not a url");
  });
});

describe("formatDuration", () => {
  it("ms / s / m+s", () => {
    expect(formatDuration(123)).toBe("123ms");
    expect(formatDuration(1234)).toBe("1.2s");
    expect(formatDuration(75_000)).toBe("1m 15s");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("formatRelative", () => {
  it("returns just-now for fresh dates", () => {
    expect(formatRelative(new Date())).toMatch(/just now|s ago/);
  });
  it("handles null", () => {
    expect(formatRelative(null)).toBe("—");
  });
});
