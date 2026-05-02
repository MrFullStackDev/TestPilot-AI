// Static-export demo build of apiFetch. The real backend (Next API routes,
// SQLite, Playwright) is not deployed to GitHub Pages, so every request is
// answered locally from src/lib/demo-data.ts. Writes are accepted as no-ops
// so the UI never errors.

import {
  demoActivity,
  demoAuth,
  demoConversation,
  demoConversations,
  demoCost,
  demoDistill,
  demoHeals,
  demoJobs,
  demoLearn,
  demoLocators,
  demoPages,
  demoProjects,
  demoRunDetails,
  demoRuns,
  demoSettings,
  demoSummaries,
  demoTestResults,
  demoTests,
  demoTickets,
} from "./demo-data";

const STORAGE_KEY = "ai-test-gen.byok";

export type ByokStore = {
  keys: { anthropic?: string; openai?: string; google?: string };
  integrations: {
    jiraEmail?: string;
    jiraToken?: string;
    jiraBaseUrl?: string;
    linearToken?: string;
  };
};

export function readByok(): ByokStore {
  if (typeof window === "undefined") return { keys: {}, integrations: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { keys: {}, integrations: {} };
    const parsed = JSON.parse(raw);
    return {
      keys: parsed.keys ?? {},
      integrations: parsed.integrations ?? {},
    };
  } catch {
    return { keys: {}, integrations: {} };
  }
}

export function writeByok(next: ByokStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearByok() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function streamResponse(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const chunks = text.match(/.{1,40}/gs) ?? [text];
      let i = 0;
      const tick = () => {
        if (i >= chunks.length) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
          return;
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "delta", text: chunks[i] })}\n\n`),
        );
        i += 1;
        setTimeout(tick, 25);
      };
      tick();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

const DEMO_REPLY =
  "(demo mode) This GitHub Pages build has no backend — chat responses are stubbed. " +
  "Run the project locally to use Claude / GPT / Gemini with your own API keys.";

function projectIdFromPath(path: string): number | null {
  const m = path.match(/\/api\/projects\/(\d+)/);
  return m ? Number(m[1]) : null;
}

function testIdFromPath(path: string): number | null {
  const m = path.match(/\/tests\/(\d+)/);
  return m ? Number(m[1]) : null;
}

function runIdFromPath(path: string): number | null {
  const m = path.match(/\/runs\/(\d+)/);
  return m ? Number(m[1]) : null;
}

function pickProject(id: number | null) {
  return demoProjects.find((p) => p.id === id) ?? demoProjects[0];
}

function route(input: string, init: RequestInit): Response {
  const url = input.startsWith("http") ? new URL(input) : new URL(input, "http://demo");
  const path = url.pathname;
  const method = (init.method ?? "GET").toUpperCase();

  // --- chat streaming ---
  if (/^\/api\/chat\/conversations\/\d+\/messages$/.test(path) && method === "POST") {
    return streamResponse(DEMO_REPLY);
  }

  // --- chat conversations ---
  if (path === "/api/chat/conversations" && method === "GET") return jsonResponse(demoConversations);
  if (path === "/api/chat/conversations" && method === "POST") {
    return jsonResponse({ id: Date.now(), title: "New chat", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), messages: [] });
  }
  const convMatch = path.match(/^\/api\/chat\/conversations\/(\d+)$/);
  if (convMatch) {
    const id = Number(convMatch[1]);
    if (method === "GET") return jsonResponse(demoConversation[id] ?? { id, title: "Conversation", messages: [] });
    return jsonResponse({ ok: true });
  }

  // --- projects ---
  if (path === "/api/projects/summaries") return jsonResponse(demoSummaries);
  if (path === "/api/projects" && method === "POST") {
    return jsonResponse({ id: 1, slug: "acme-shop", name: "Acme Shop (demo)", root_url: "https://acme-shop.example.com" });
  }

  const projectId = projectIdFromPath(path);
  if (projectId !== null) {
    const project = pickProject(projectId);

    if (/\/api\/projects\/\d+$/.test(path)) {
      if (method === "GET") return jsonResponse(project);
      return jsonResponse({ ok: true });
    }

    if (path.endsWith("/cost")) return jsonResponse(demoCost[projectId as 1 | 2] ?? demoCost[1]);
    if (path.endsWith("/activity")) return jsonResponse(demoActivity[projectId as 1 | 2] ?? []);
    if (path.endsWith("/learn")) {
      if (method === "GET") return jsonResponse(demoLearn[projectId as 1 | 2] ?? demoLearn[1]);
      return jsonResponse({ ok: true, profile: (demoLearn[projectId as 1 | 2] ?? demoLearn[1]).profile });
    }
    if (path.endsWith("/auth/info")) return jsonResponse(demoAuth[projectId as 1 | 2] ?? demoAuth[1]);
    if (path.endsWith("/auth/record")) return jsonResponse({ ok: true, jobId: "demo-auth-job" });
    if (path.endsWith("/heal")) {
      if (method === "GET") return jsonResponse(demoHeals[projectId as 1 | 2] ?? []);
      return jsonResponse({ ok: true, jobId: "demo-heal-job" });
    }
    if (path.endsWith("/discover") || path.endsWith("/crawl") || path.endsWith("/run") || path.endsWith("/generate") || path.endsWith("/cleanup") || path.endsWith("/export")) {
      return jsonResponse({ ok: true, jobId: `demo-${Date.now()}` });
    }
    if (/\/pages\/\d+$/.test(path)) return jsonResponse({ ok: true });
    if (path.endsWith("/pages") || path.includes("/pages?")) {
      const pages = demoPages[projectId as 1 | 2] ?? [];
      const captured = url.searchParams.get("captured");
      return jsonResponse(captured === "1" ? pages.filter((p) => p.captured === 1) : pages);
    }

    const runId = runIdFromPath(path);
    if (runId !== null) {
      return jsonResponse(demoRunDetails[runId] ?? { id: runId, project_id: projectId, status: "passed", results: [] });
    }
    if (path.endsWith("/runs")) return jsonResponse(demoRuns[projectId as 1 | 2] ?? []);

    const testId = testIdFromPath(path);
    if (testId !== null) {
      if (path.endsWith("/results")) return jsonResponse(demoTestResults[testId] ?? []);
      if (method === "PATCH" || method === "POST") return jsonResponse({ ok: true });
      return jsonResponse(demoTests[projectId as 1 | 2]?.find((t) => t.id === testId) ?? null);
    }
    if (path.endsWith("/tests")) return jsonResponse(demoTests[projectId as 1 | 2] ?? []);
  }

  // --- settings / distill / locators / tickets / jobs ---
  if (path === "/api/settings") {
    if (method === "GET") return jsonResponse(demoSettings);
    return jsonResponse({ ok: true });
  }
  if (path.startsWith("/api/settings/ping")) return jsonResponse({ ok: true, latency_ms: 142 });
  if (path === "/api/distill") return jsonResponse(demoDistill);
  if (path === "/api/locators") return jsonResponse(demoLocators);
  if (path === "/api/tickets") {
    if (method === "POST") return jsonResponse({ ok: true, ticket: { id: 1, source: "manual", key: "DEMO-1", title: "Demo ticket", body: "Backend is disabled in this static build.", created_at: new Date().toISOString() } });
    return jsonResponse(demoTickets);
  }
  if (path === "/api/jobs" || path.startsWith("/api/jobs?")) return jsonResponse(demoJobs);
  if (/^\/api\/jobs\//.test(path)) return jsonResponse({ ok: true });

  // --- catch-all ---
  return jsonResponse({ ok: true, demo: true, path });
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return route(input, init);
}
