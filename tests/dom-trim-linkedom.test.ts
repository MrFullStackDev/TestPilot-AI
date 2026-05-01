import { describe, it, expect } from "vitest";
import { trimDom } from "../src/server/crawler/dom-trim";

describe("trimDom (linkedom-backed)", () => {
  it("handles malformed HTML without throwing", () => {
    const out = trimDom(`<div><span>oops</div>`);
    expect(out).toMatch(/oops/);
  });

  it("preserves data-testid and aria-* attributes", () => {
    const html = `<button id="b" data-testid="go" aria-label="Submit" onclick="evil()">Go</button>`;
    const out = trimDom(`<html><body>${html}</body></html>`);
    expect(out).toContain('data-testid="go"');
    expect(out).toContain('aria-label="Submit"');
    expect(out).not.toContain("onclick");
  });

  it("strips scripts/styles/iframe/svg", () => {
    const html = `<html><head><style>.x{}</style><script>x()</script></head>
      <body><iframe src="bad"></iframe><svg><path/></svg><p>kept</p></body></html>`;
    const out = trimDom(html);
    expect(out).not.toMatch(/script|style|iframe|svg|path/i);
    expect(out).toMatch(/kept/);
  });

  it("collapses long sibling runs", () => {
    const items = Array.from({ length: 20 }, (_, i) => `<li class="row">item ${i}</li>`).join("");
    const html = `<html><body><ul>${items}</ul></body></html>`;
    const out = trimDom(html);
    expect(out).toMatch(/16 more similar lis/);
  });

  it("drops display:none and aria-hidden", () => {
    const html = `<html><body>
      <div style="display:none">secret</div>
      <div aria-hidden="true">also-hidden</div>
      <div>visible</div>
    </body></html>`;
    const out = trimDom(html);
    expect(out).not.toMatch(/secret|also-hidden/);
    expect(out).toMatch(/visible/);
  });
});
