// Centralised security knobs for SSRF + auth-recorder. Settings come from env.

const ALLOW_PRIVATE = process.env.AI_TEST_GEN_ALLOW_PRIVATE_HOSTS === "1";

export function ssrfPolicy() {
  return { allowLocalhost: ALLOW_PRIVATE };
}

// True when the user has opted in to crawling private/loopback hosts (e.g. for
// testing localhost apps). Set AI_TEST_GEN_ALLOW_PRIVATE_HOSTS=1 to enable.
export function allowsPrivateHosts(): boolean {
  return ALLOW_PRIVATE;
}
