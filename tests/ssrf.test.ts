import { describe, it, expect } from "vitest";
import { assertPublicUrl, _internal } from "../src/server/security/ssrf";

describe("SSRF guard", () => {
  it("blocks loopback / link-local / private IPv4", async () => {
    expect(_internal.isPrivateV4("127.0.0.1")).toBe(true);
    expect(_internal.isPrivateV4("10.0.0.1")).toBe(true);
    expect(_internal.isPrivateV4("172.20.5.5")).toBe(true);
    expect(_internal.isPrivateV4("192.168.1.1")).toBe(true);
    expect(_internal.isPrivateV4("169.254.169.254")).toBe(true);
    expect(_internal.isPrivateV4("100.64.0.1")).toBe(true);
    expect(_internal.isPrivateV4("0.0.0.0")).toBe(true);
    expect(_internal.isPrivateV4("8.8.8.8")).toBe(false);
  });

  it("blocks IPv6 loopback and ULAs", () => {
    expect(_internal.isPrivateV6("::1")).toBe(true);
    expect(_internal.isPrivateV6("fe80::1")).toBe(true);
    expect(_internal.isPrivateV6("fd00::1")).toBe(true);
    expect(_internal.isPrivateV6("2001:db8::1")).toBe(false);
  });

  it("rejects non-http schemes", async () => {
    await expect(assertPublicUrl("javascript:alert(1)")).rejects.toThrow(/scheme/i);
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/scheme/i);
    await expect(assertPublicUrl("ftp://example.com")).rejects.toThrow(/scheme/i);
  });

  it("rejects IP literals targeting private space", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toThrow(/private/i);
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/private/i);
    await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow(/private/i);
  });

  it("rejects literal localhost", async () => {
    await expect(assertPublicUrl("http://localhost:3000/")).rejects.toThrow(/localhost/);
    await expect(assertPublicUrl("http://app.localhost/")).rejects.toThrow(/localhost/);
  });

  it("allows public DNS host (no DNS poisoning required)", async () => {
    // example.com resolves to public IPs
    const u = await assertPublicUrl("https://example.com/");
    expect(u.hostname).toBe("example.com");
  });

  it("allowLocalhost lets through 127.0.0.1 explicitly", async () => {
    const u = await assertPublicUrl("http://127.0.0.1:9999/", { allowLocalhost: true });
    expect(u.hostname).toBe("127.0.0.1");
  });
});
