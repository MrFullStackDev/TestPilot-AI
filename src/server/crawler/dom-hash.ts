import crypto from "node:crypto";

export function hashTrimmedDom(trimmed: string): string {
  return crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 16);
}
