// Static demo data for the GitHub Pages build. apiFetch returns these
// instead of hitting the (deleted) Next API routes.

export const DEMO_PROJECT_IDS = [1, 2] as const;
export const DEMO_TEST_IDS = [1, 2, 3] as const;

export const demoProjects = [
  {
    id: 1,
    slug: "acme-shop",
    name: "Acme Shop",
    root_url: "https://acme-shop.example.com",
    framework: "playwright",
    output_dir: "tests/generated",
    created_at: "2026-04-15T10:30:00Z",
  },
  {
    id: 2,
    slug: "widget-dash",
    name: "Widget Dashboard",
    root_url: "https://widget.example.com",
    framework: "playwright",
    output_dir: "tests/generated",
    created_at: "2026-04-22T14:00:00Z",
  },
] as const;

export const demoSummaries = [
  {
    id: 1, slug: "acme-shop", name: "Acme Shop",
    root_url: "https://acme-shop.example.com", framework: "playwright",
    created_at: "2026-04-15T10:30:00Z",
    test_count: 6, flaky_count: 1, pending_heals: 2, cost_usd: 1.84,
    last_capture_at: "2026-04-30T08:12:00Z",
    last_run_at: "2026-05-01T17:42:00Z",
    last_run_status: "passed", last_run_pass: 5, last_run_total: 6,
  },
  {
    id: 2, slug: "widget-dash", name: "Widget Dashboard",
    root_url: "https://widget.example.com", framework: "playwright",
    created_at: "2026-04-22T14:00:00Z",
    test_count: 2, flaky_count: 0, pending_heals: 0, cost_usd: 0.31,
    last_capture_at: "2026-04-28T11:00:00Z",
    last_run_at: null, last_run_status: null, last_run_pass: null, last_run_total: null,
  },
];

export const demoPages = {
  1: [
    { id: 1, project_id: 1, url: "https://acme-shop.example.com/", title: "Acme Shop — Home", captured: 1, captured_at: "2026-04-30T08:10:00Z" },
    { id: 2, project_id: 1, url: "https://acme-shop.example.com/products", title: "All products", captured: 1, captured_at: "2026-04-30T08:10:30Z" },
    { id: 3, project_id: 1, url: "https://acme-shop.example.com/cart", title: "Cart", captured: 1, captured_at: "2026-04-30T08:11:00Z" },
    { id: 4, project_id: 1, url: "https://acme-shop.example.com/checkout", title: "Checkout", captured: 1, captured_at: "2026-04-30T08:11:30Z" },
    { id: 5, project_id: 1, url: "https://acme-shop.example.com/account", title: "My account", captured: 1, captured_at: "2026-04-30T08:12:00Z" },
    { id: 6, project_id: 1, url: "https://acme-shop.example.com/orders", title: "Orders", captured: 0, captured_at: null },
    { id: 7, project_id: 1, url: "https://acme-shop.example.com/help", title: "Help center", captured: 0, captured_at: null },
    { id: 8, project_id: 1, url: "https://acme-shop.example.com/contact", title: "Contact", captured: 0, captured_at: null },
  ],
  2: [
    { id: 11, project_id: 2, url: "https://widget.example.com/", title: "Widget Dashboard", captured: 1, captured_at: "2026-04-28T10:50:00Z" },
    { id: 12, project_id: 2, url: "https://widget.example.com/widgets", title: "Widgets", captured: 1, captured_at: "2026-04-28T11:00:00Z" },
    { id: 13, project_id: 2, url: "https://widget.example.com/settings", title: "Settings", captured: 0, captured_at: null },
  ],
} as const;

export const demoTests = {
  1: [
    { id: 1, project_id: 1, name: "homepage shows hero and CTA", file_path: "tests/generated/home.spec.ts", flaky_flag: 0, flaky_reason: null, quarantined: 0 },
    { id: 2, project_id: 1, name: "user can add product to cart", file_path: "tests/generated/cart-add.spec.ts", flaky_flag: 0, flaky_reason: null, quarantined: 0 },
    { id: 3, project_id: 1, name: "cart updates quantity correctly", file_path: "tests/generated/cart-update.spec.ts", flaky_flag: 1, flaky_reason: "intermittent toast wait timeout", quarantined: 0 },
    { id: 4, project_id: 1, name: "checkout requires login when guest disabled", file_path: "tests/generated/checkout-auth.spec.ts", flaky_flag: 0, flaky_reason: null, quarantined: 0 },
    { id: 5, project_id: 1, name: "account page lists past orders", file_path: "tests/generated/account-orders.spec.ts", flaky_flag: 0, flaky_reason: null, quarantined: 0 },
    { id: 6, project_id: 1, name: "search returns relevant products", file_path: "tests/generated/search.spec.ts", flaky_flag: 0, flaky_reason: null, quarantined: 0 },
  ],
  2: [
    { id: 11, project_id: 2, name: "dashboard renders without errors", file_path: "tests/generated/dashboard.spec.ts", flaky_flag: 0, flaky_reason: null, quarantined: 0 },
    { id: 12, project_id: 2, name: "widget list filters by status", file_path: "tests/generated/widget-filter.spec.ts", flaky_flag: 0, flaky_reason: null, quarantined: 0 },
  ],
} as const;

export const demoRuns = {
  1: [
    { id: 31, project_id: 1, status: "passed", started_at: "2026-05-01T17:42:00Z", finished_at: "2026-05-01T17:43:14Z", pass: 5, fail: 1, total: 6 },
    { id: 30, project_id: 1, status: "failed", started_at: "2026-04-29T09:10:00Z", finished_at: "2026-04-29T09:11:42Z", pass: 4, fail: 2, total: 6 },
    { id: 29, project_id: 1, status: "passed", started_at: "2026-04-27T15:00:00Z", finished_at: "2026-04-27T15:01:08Z", pass: 6, fail: 0, total: 6 },
  ],
  2: [],
} as const;

export const demoRunDetails: Record<number, { id: number; project_id: number; status: string; results: Array<{ id: number; test_id: number; name: string; status: string; duration_ms: number; error: string | null }> }> = {
  31: {
    id: 31, project_id: 1, status: "passed",
    results: [
      { id: 101, test_id: 1, name: "homepage shows hero and CTA", status: "passed", duration_ms: 1240, error: null },
      { id: 102, test_id: 2, name: "user can add product to cart", status: "passed", duration_ms: 2890, error: null },
      { id: 103, test_id: 3, name: "cart updates quantity correctly", status: "failed", duration_ms: 5012, error: "Timeout 5000ms waiting for toast '.cart-toast' to appear" },
      { id: 104, test_id: 4, name: "checkout requires login when guest disabled", status: "passed", duration_ms: 1810, error: null },
      { id: 105, test_id: 5, name: "account page lists past orders", status: "passed", duration_ms: 2103, error: null },
      { id: 106, test_id: 6, name: "search returns relevant products", status: "passed", duration_ms: 1670, error: null },
    ],
  },
  30: { id: 30, project_id: 1, status: "failed", results: [] },
  29: { id: 29, project_id: 1, status: "passed", results: [] },
};

export const demoTestResults: Record<number, Array<{ id: number; status: string; duration_ms: number | null; error: string | null; run_id: number }>> = {
  1: [
    { id: 101, status: "passed", duration_ms: 1240, error: null, run_id: 31 },
    { id: 91, status: "passed", duration_ms: 1198, error: null, run_id: 30 },
    { id: 81, status: "passed", duration_ms: 1305, error: null, run_id: 29 },
  ],
  2: [
    { id: 102, status: "passed", duration_ms: 2890, error: null, run_id: 31 },
    { id: 92, status: "passed", duration_ms: 3015, error: null, run_id: 30 },
    { id: 82, status: "passed", duration_ms: 2950, error: null, run_id: 29 },
  ],
  3: [
    { id: 103, status: "failed", duration_ms: 5012, error: "Timeout 5000ms waiting for toast '.cart-toast' to appear", run_id: 31 },
    { id: 93, status: "passed", duration_ms: 4128, error: null, run_id: 30 },
    { id: 83, status: "failed", duration_ms: 5021, error: "Timeout 5000ms waiting for toast '.cart-toast' to appear", run_id: 29 },
  ],
};

export const demoHeals = {
  1: [
    {
      id: 1, test_id: 3, project_id: 1,
      old_locator: "[data-testid='cart-toast']",
      new_locator: "[role='status'][aria-label='Cart updated']",
      reason: "data-testid was removed in last release; role/aria-label is stable",
      confidence: 0.86, accepted: 0,
      created_at: "2026-05-01T17:43:30Z",
      test_name: "cart updates quantity correctly",
    },
    {
      id: 2, test_id: 4, project_id: 1,
      old_locator: "button.checkout-btn",
      new_locator: "button:has-text('Continue to checkout')",
      reason: "class names are utility-generated and brittle; text-based locator is more durable",
      confidence: 0.74, accepted: 0,
      created_at: "2026-05-01T17:43:32Z",
      test_name: "checkout requires login when guest disabled",
    },
  ],
  2: [],
} as const;

export const demoActivity = {
  1: [
    { id: 1, kind: "run", title: "Run #31 finished", detail: "5 / 6 passed", at: "2026-05-01T17:43:14Z" },
    { id: 2, kind: "heal", title: "Heal proposed", detail: "cart-toast → role/aria-label", at: "2026-05-01T17:43:30Z" },
    { id: 3, kind: "generate", title: "Generated 6 tests", detail: "via Claude Sonnet 4.6", at: "2026-04-30T08:30:00Z" },
    { id: 4, kind: "capture", title: "Captured 5 pages", detail: "DOM + screenshots", at: "2026-04-30T08:12:00Z" },
  ],
  2: [
    { id: 11, kind: "capture", title: "Captured 2 pages", detail: "DOM + screenshots", at: "2026-04-28T11:00:00Z" },
  ],
} as const;

export const demoCost = {
  1: {
    total: 1.84, budget: 10,
    byProvider: [
      { provider: "anthropic", model: "claude-sonnet-4-6", calls: 14, in_tok: 38420, out_tok: 6120, cached: 12000, cost: 1.42 },
      { provider: "openai",    model: "gpt-4o-mini",      calls:  3, in_tok:  4200, out_tok:  890, cached:     0, cost: 0.42 },
    ],
    byPurpose: [
      { purpose: "test-generation", calls:  9, cost: 1.10 },
      { purpose: "distill",         calls:  4, cost: 0.32 },
      { purpose: "heal",            calls:  3, cost: 0.32 },
      { purpose: "chat",            calls:  1, cost: 0.10 },
    ],
  },
  2: {
    total: 0.31, budget: 10,
    byProvider: [
      { provider: "google", model: "gemini-1.5-flash", calls: 4, in_tok: 8420, out_tok: 1310, cached: 0, cost: 0.31 },
    ],
    byPurpose: [
      { purpose: "test-generation", calls: 2, cost: 0.21 },
      { purpose: "distill",         calls: 2, cost: 0.10 },
    ],
  },
} as const;

export const demoLearn = {
  1: {
    profile: {
      framework_hint: "Next.js + Tailwind",
      stable_locator_strategies: ["data-testid", "role+name", "aria-label"],
      auth: { kind: "form", login_url: "/login", username_field: "input[name='email']", password_field: "input[name='password']" },
      common_patterns: ["toast notifications via role=status", "modals via Radix Dialog"],
      notes: "Routes are SSR; hydration is fast. Cart and checkout require an authenticated session for guest-disabled mode.",
    },
    last_built_at: "2026-04-30T08:25:00Z",
  },
  2: { profile: null, last_built_at: null },
} as const;

export const demoAuth = {
  1: { recorded: true, kind: "form", recorded_at: "2026-04-29T18:10:00Z", username_redacted: "demo@acme-shop.example.com" },
  2: { recorded: false, kind: null, recorded_at: null, username_redacted: null },
} as const;

export const demoConversations = [
  { id: 1, title: "Brainstorm test cases for /checkout", created_at: "2026-04-30T19:20:00Z", updated_at: "2026-04-30T19:35:00Z" },
  { id: 2, title: "Why is the cart-toast flaky?", created_at: "2026-05-01T18:02:00Z", updated_at: "2026-05-01T18:10:00Z" },
];

export const demoConversation: Record<number, { id: number; title: string; messages: Array<{ id: number; role: string; content: string; created_at: string }> }> = {
  1: {
    id: 1, title: "Brainstorm test cases for /checkout",
    messages: [
      { id: 1, role: "user", content: "What test cases should I cover for /checkout? Guest checkout is currently disabled.", created_at: "2026-04-30T19:20:00Z" },
      { id: 2, role: "assistant", content: "Cover: (1) unauthenticated user is redirected to /login with `?next=/checkout`, (2) authenticated user with empty cart sees an empty-state, (3) happy-path order placement with one item, (4) coupon code application, (5) declined card surfaces a clear error, (6) browser back-button after success doesn't allow re-submission.", created_at: "2026-04-30T19:21:00Z" },
    ],
  },
  2: {
    id: 2, title: "Why is the cart-toast flaky?",
    messages: [
      { id: 3, role: "user", content: "test 'cart updates quantity correctly' fails intermittently waiting for .cart-toast", created_at: "2026-05-01T18:02:00Z" },
      { id: 4, role: "assistant", content: "The selector `.cart-toast` looks utility-class based — those tend to change between releases. Switch to a role-based locator: `getByRole('status', { name: /cart updated/i })`. Also bump the wait to 8s if the toast is debounced.", created_at: "2026-05-01T18:03:00Z" },
    ],
  },
};

export const demoSettings = {
  budget_usd: 10,
  default_provider: "anthropic",
  default_model: "claude-sonnet-4-6",
  webSearch: false,
  byok_present: { anthropic: false, openai: false, google: false },
};

export const demoTickets: Array<{ id: number; source: string; key: string; title: string; body: string; created_at: string }> = [];

export const demoJobs: Array<{ id: string; kind: string; projectId: number; startedAt: number; status: string }> = [];

export const demoDistill = {
  url: "https://example.com",
  bytes_in: 18420,
  bytes_out: 2103,
  reduction_pct: 89,
  outline: [
    { tag: "header", role: "banner", children: 3 },
    { tag: "main",   role: "main",   children: 5 },
    { tag: "footer", role: "contentinfo", children: 2 },
  ],
  prompt_safe_text: "(demo) distilled DOM would appear here — strip styles, retain semantics, preserve role+name for the model.",
};

export const demoLocators = {
  candidates: [
    { strategy: "role+name", value: "getByRole('button', { name: 'Add to cart' })", score: 0.94, rationale: "stable across i18n via role; visible button text" },
    { strategy: "data-testid", value: "[data-testid='add-to-cart']", score: 0.88, rationale: "explicit test hook present in markup" },
    { strategy: "aria-label", value: "[aria-label='Add to cart']", score: 0.82, rationale: "accessible label is unique on this page" },
    { strategy: "css", value: "main .product-card button.primary", score: 0.41, rationale: "fragile — depends on utility class chain" },
  ],
};
