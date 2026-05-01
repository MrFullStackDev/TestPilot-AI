// Classify Playwright failure messages so we know whether to attempt heal.

export type FailureKind = "locator" | "assertion" | "timeout" | "navigation" | "unknown";

export function classifyFailure(error: string | null | undefined): FailureKind {
  if (!error) return "unknown";
  const e = error.toLowerCase();

  // Locator failures: explicit element-resolution problems.
  if (/locator\.(click|fill|select|press|check|hover)/i.test(e)) return "locator";
  if (/element is not (visible|attached|stable|enabled)/i.test(e)) return "locator";
  if (/strict mode violation/i.test(e)) return "locator";
  if (/no element matches/i.test(e)) return "locator";
  if (/no node found for selector/i.test(e)) return "locator";

  if (/expect\(/i.test(e) || /tobevisible|tocontaintext|tohaveurl|tohavetext|tohavevalue/.test(e)) return "assertion";

  if (/timeout|timed out|exceeded/i.test(e)) {
    // Many "timed out" failures are actually locator failures in disguise.
    if (/waiting for/i.test(e) && /locator/i.test(e)) return "locator";
    return "timeout";
  }

  if (/net::|err_/i.test(e) || /navigation/i.test(e)) return "navigation";

  return "unknown";
}
