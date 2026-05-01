import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { sseStream } from "@/server/llm/sse";
import { streamChat, type ChatMessage } from "@/server/llm/chat";
import { runWithRequestKeys } from "@/server/llm/request-context";

export const runtime = "nodejs";
export const maxDuration = 600;

const Body = z.object({
  content: z.string().min(1).max(60_000),
  webSearch: z.boolean().default(false),
  template: z.enum(["test-cases", "code-review", "qa-question"]).optional(),
  provider: z.enum(["anthropic", "openai", "google"]).optional(),
  model: z.string().optional(),
});

const TEMPLATES: Record<NonNullable<z.infer<typeof Body>["template"]>, string> = {
  "test-cases":
    "You are a senior QA engineer. Given a feature description, write a comprehensive yet pragmatic test plan: happy path, alternate paths, edge cases, error handling, accessibility, and performance considerations. Use Gherkin-style or numbered steps. Be specific about expected results. Focus on user-visible behaviour.",
  "code-review":
    "You are a senior software engineer reviewing code. Identify bugs, security issues, edge cases, and performance problems. Suggest improvements with concrete code examples. Be precise — cite line numbers when given. Skip stylistic nitpicks unless they hurt readability.",
  "qa-question":
    "You are a precise QA expert. Answer the user's testing question directly and concisely. When the answer depends on context (framework, project type, environment), ask one clarifying question first. Cite documentation when relevant.",
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const conversationId = Number(params.id);
  const conv = db().prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId) as { id: number; title: string } | undefined;
  if (!conv) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.message }), { status: 400 });
  const body = parsed.data;

  // Persist the user's message before streaming so a disconnected client doesn't lose it.
  db().prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)").run(conversationId, body.content);
  // Auto-title conversation from first message if still default.
  if (conv.title === "New conversation") {
    const auto = body.content.split("\n")[0].slice(0, 60);
    db().prepare("UPDATE conversations SET title = ? WHERE id = ?").run(auto, conversationId);
  }

  // Build history.
  const rows = db().prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC").all(conversationId) as Array<{ role: "user" | "assistant"; content: string }>;
  const history: ChatMessage[] = rows.map((r) => ({ role: r.role, content: r.content }));

  const systemBase = body.template ? TEMPLATES[body.template] : "You are a helpful QA assistant.";
  const system = body.webSearch
    ? `${systemBase}\n\nYou have access to a web_search tool. Use it when current information would meaningfully improve the answer (recent docs, library versions, errors). Cite sources inline.`
    : systemBase;

  return sseStream((sink) => runWithRequestKeys(req, async () => {
    let assistantText = "";
    const webResults: Array<{ query: string; results: Array<{ title: string; url: string; snippet?: string }> }> = [];

    await streamChat(history, {
      provider: body.provider,
      model: body.model,
      webSearch: body.webSearch,
      system,
      conversationId,
    }, (c) => {
      switch (c.type) {
        case "delta":     assistantText += c.text; sink.send({ type: "delta", text: c.text }); break;
        case "tool_use":  sink.send({ type: "tool_use", name: c.name }); break;
        case "web_results": webResults.push({ query: c.query, results: c.results }); sink.send({ type: "web_results", results: c.results }); break;
        case "done":      sink.send({ type: "done", usage: c.usage }); break;
        case "error":     sink.send({ type: "error", message: c.message }); break;
      }
    });

    // Persist assistant message
    db().transaction(() => {
      db().prepare("INSERT INTO messages (conversation_id, role, content, web_results_json) VALUES (?, 'assistant', ?, ?)")
        .run(conversationId, assistantText, webResults.length ? JSON.stringify(webResults) : null);
      db().prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);
    })();

    sink.send({ type: "saved" });
  }));
}
