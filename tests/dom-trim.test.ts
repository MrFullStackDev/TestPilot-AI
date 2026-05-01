import { describe, it, expect } from "vitest";
import { trimDom } from "../src/server/crawler/dom-trim";

describe("trimDom", () => {
  it("strips scripts and styles", () => {
    const html = `<html><head><style>x{}</style><script>alert(1)</script></head><body><p>hi</p></body></html>`;
    const out = trimDom(html);
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/style/i);
    expect(out).toMatch(/<p>hi<\/p>/);
  });

  it("keeps whitelisted attrs", () => {
    const html = `<button id="b" onclick="x()" data-testid="submit" class="btn primary primary-large extra crap" aria-label="Submit">Go</button>`;
    const out = trimDom(`<html><body>${html}</body></html>`);
    expect(out).toContain('data-testid="submit"');
    expect(out).toContain('aria-label="Submit"');
    expect(out).toContain('id="b"');
    expect(out).not.toContain("onclick");
  });

  it("collapses long runs of similar siblings", () => {
    const items = Array.from({ length: 20 }, (_, i) => `<li class="row">item ${i}</li>`).join("");
    const html = `<html><body><ul>${items}</ul></body></html>`;
    const out = trimDom(html);
    expect(out).toMatch(/16 more similar lis/);
  });

  it("drops display:none", () => {
    const html = `<html><body><div style="display:none">hidden</div><div>visible</div></body></html>`;
    const out = trimDom(html);
    expect(out).not.toMatch(/hidden/);
    expect(out).toMatch(/visible/);
  });
});
