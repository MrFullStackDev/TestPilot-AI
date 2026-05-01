// DOM trim: strip noise so the LLM only sees meaningful structure.
// Implementation uses linkedom for proper HTML parsing — handles malformed
// markup, CDATA, attributes containing `>`, etc. that the previous hand-rolled
// parser mishandled.
//
// We keep tag names, useful attrs (id, class, data-*, aria-*, role, type, name,
// href, src, alt, placeholder, value, for) and visible text. We drop scripts,
// styles, hidden elements, SVGs, iframes, comments. Long runs of identical
// sibling shapes (e.g. 200 <li> in a list) collapse to first 4 + sentinel.

import { parseHTML } from "linkedom";

const KEEP_ATTRS = new Set([
  "id", "class", "role", "type", "name", "href", "src", "alt", "title",
  "placeholder", "value", "for", "checked", "disabled", "selected", "label",
]);
const KEEP_ATTR_PREFIXES = ["data-", "aria-"];
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "PATH", "IFRAME", "OBJECT", "EMBED",
]);
const VOID_TAGS = new Set([
  "AREA", "BASE", "BR", "COL", "EMBED", "HR", "IMG", "INPUT",
  "LINK", "META", "PARAM", "SOURCE", "TRACK", "WBR",
]);

const PARSE_LIMIT_BYTES = 10 * 1024 * 1024;

export function trimDom(html: string): string {
  if (!html) return "";
  const slice = html.length > PARSE_LIMIT_BYTES ? html.slice(0, PARSE_LIMIT_BYTES) : html;
  const { document } = parseHTML(slice);
  const root = document.documentElement || document.body || document;
  const out = walk(root as any);
  return out.trim();
}

function walk(node: any, depth = 0): string {
  if (!node) return "";
  if (node.nodeType === 8 /* COMMENT_NODE */) return "";
  if (node.nodeType === 3 /* TEXT_NODE */) {
    const t = collapseWs(node.nodeValue || "");
    return t;
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */ && node.nodeType !== 9 /* DOCUMENT */) {
    return "";
  }

  const tag: string = (node.tagName || "").toUpperCase();

  if (SKIP_TAGS.has(tag)) return "";

  if (!isVisible(node)) return "";

  // gather attrs
  const attrs: Record<string, string> = {};
  if (typeof node.getAttributeNames === "function") {
    for (const a of node.getAttributeNames()) {
      const lc = a.toLowerCase();
      if (KEEP_ATTRS.has(lc) || KEEP_ATTR_PREFIXES.some((p) => lc.startsWith(p))) {
        const v = node.getAttribute(a) ?? "";
        attrs[lc] = v;
      }
    }
  }
  if (attrs.class) {
    const tokens = attrs.class.split(/\s+/).filter(Boolean).slice(0, 4);
    attrs.class = tokens.join(" ");
  }

  // Walk + collapse repeated children
  const childNodes: any[] = Array.from(node.childNodes || []);
  const childOut: Array<{ raw: string; sig: string | null }> = [];
  for (const c of childNodes) {
    const raw = walk(c, depth + 1);
    if (!raw) continue;
    const sig = c.nodeType === 1 ? signature(c) : null;
    childOut.push({ raw, sig });
  }

  // Collapse runs of identical signatures
  const collapsed: string[] = [];
  let i = 0;
  while (i < childOut.length) {
    const cur = childOut[i];
    if (cur.sig === null) { collapsed.push(cur.raw); i++; continue; }
    let j = i + 1;
    while (j < childOut.length && childOut[j].sig === cur.sig) j++;
    const run = childOut.slice(i, j);
    if (run.length > 6) {
      for (let k = 0; k < 4; k++) collapsed.push(run[k].raw);
      const tagSig = cur.sig.split("|")[0].toLowerCase();
      collapsed.push(`(... ${run.length - 4} more similar ${tagSig}s)`);
    } else {
      for (const r of run) collapsed.push(r.raw);
    }
    i = j;
  }

  const tagLc = tag.toLowerCase();
  if (tag === "HTML" || node.nodeType === 9) {
    return collapsed.join("\n");
  }

  if (VOID_TAGS.has(tag)) {
    return `<${tagLc}${renderAttrs(attrs)}></${tagLc}>`;
  }

  if (collapsed.length === 0) {
    return `<${tagLc}${renderAttrs(attrs)}></${tagLc}>`;
  }

  // Inline if all child fragments are short text
  const allShortText = collapsed.every((s) => !s.startsWith("<") && s.length < 80);
  if (allShortText) {
    return `<${tagLc}${renderAttrs(attrs)}>${collapsed.join("")}</${tagLc}>`;
  }
  const inner = collapsed.map((s) => "  ".repeat(depth + 1) + s).join("\n");
  return `<${tagLc}${renderAttrs(attrs)}>\n${inner}\n${"  ".repeat(depth)}</${tagLc}>`;
}

function isVisible(node: any): boolean {
  if (typeof node.getAttribute !== "function") return true;
  if (node.hasAttribute && node.hasAttribute("hidden")) return false;
  if (node.getAttribute("aria-hidden") === "true") return false;
  const style = (node.getAttribute("style") || "").toLowerCase();
  if (/display\s*:\s*none/.test(style)) return false;
  if (/visibility\s*:\s*hidden/.test(style)) return false;
  return true;
}

function signature(node: any): string {
  const tag = (node.tagName || "").toLowerCase();
  const cls = (node.getAttribute?.("class") || "").split(/\s+/).slice(0, 2).join(" ");
  const role = node.getAttribute?.("role") || "";
  const attrKeys: string[] = (typeof node.getAttributeNames === "function"
    ? node.getAttributeNames().map((a: string) => a.toLowerCase()).sort()
    : []) as string[];
  return `${tag}|${attrKeys.join(",")}|${role}|${cls}`;
}

function renderAttrs(attrs: Record<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === "" && (k === "checked" || k === "disabled" || k === "selected")) parts.push(k);
    else if (v !== "") parts.push(`${k}="${escape(v)}"`);
  }
  return parts.length === 0 ? "" : " " + parts.join(" ");
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
