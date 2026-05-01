import { NextResponse } from "next/server";
import { ZodError } from "zod";

// Standard API error envelope. Backwards-compatible with the older
// `{ error: "msg" }` shape used across the existing UI:
//   { ok: false, error: "msg", code, details? }
// so consumers reading `body.error` keep working while new consumers can
// branch on `body.code` instead of pattern-matching messages.

export type ApiErrorCode =
  | "validation"
  | "not_found"
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "ssrf_blocked"
  | "budget_exceeded"
  | "upstream_failed"
  | "internal";

const CODE_TO_STATUS: Record<ApiErrorCode, number> = {
  validation: 400,
  not_found: 404,
  conflict: 409,
  unauthorized: 401,
  forbidden: 403,
  rate_limited: 429,
  ssrf_blocked: 400,
  budget_exceeded: 402,
  upstream_failed: 502,
  internal: 500,
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  statusOverride?: number,
): NextResponse {
  const status = statusOverride ?? CODE_TO_STATUS[code];
  return NextResponse.json(
    { ok: false, error: message, code, ...(details !== undefined ? { details } : {}) },
    { status },
  );
}

// Translate a Zod validation failure into the standard envelope.
export function apiZodError(err: ZodError): NextResponse {
  const message = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return apiError("validation", message, { issues: err.issues });
}

// Wrap an unknown thrown error. In production, hide the underlying message;
// in dev, surface it as `details.message` to aid debugging.
export function apiUnknownError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  const details = process.env.NODE_ENV === "production" ? undefined : { message: msg };
  return apiError("internal", "internal error", details);
}
