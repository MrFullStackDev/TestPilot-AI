"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Globe, Send, MessageSquare, Trash2, Pencil, RotateCw, Copy, ArrowDown, Menu, ExternalLink, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api";
import { formatRelative, cn } from "@/lib/utils";
import { formatUSD } from "@/lib/cost";
import { useToast } from "@/components/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

type Conv = { id: number; title: string; provider: string | null; model: string | null; updated_at: string; message_count: number };
type Msg = { id?: number; role: "user" | "assistant"; content: string; web_results_json?: string | null };
type WebResult = { title: string; url: string; snippet?: string };

const TEMPLATES = [
  { id: "test-cases",  label: "Test cases",  hint: "Comprehensive plan from a feature description." },
  { id: "code-review", label: "Code review", hint: "Bugs, edge cases, security." },
  { id: "qa-question", label: "QA question", hint: "Concise, sourced answers." },
] as const;

const PROVIDERS = [
  { id: "anthropic", label: "Claude" },
  { id: "openai",    label: "GPT" },
  { id: "google",    label: "Gemini" },
] as const;

const STARTER_PROMPTS = [
  "Generate a test plan for a checkout flow with Apple Pay, regular card, and a coupon field.",
  "Review this Playwright spec for flake risk: ```ts\n// paste here\n```",
  "What's a flake-resistant locator strategy for a virtualised list?",
];

export default function ChatPage() {
  const search = useSearchParams();
  const queryConvId = search?.get("c");
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<number | null>(queryConvId ? Number(queryConvId) : null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState<typeof TEMPLATES[number]["id"] | "">("");
  const [webSearch, setWebSearch] = useState(false);
  const [provider, setProvider] = useState<typeof PROVIDERS[number]["id"]>("anthropic");
  const [usage, setUsage] = useState<{ costUsd: number; inputTokens: number; outputTokens: number; model: string } | null>(null);
  const [convCost, setConvCost] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { push } = useToast();
  const confirm = useConfirm();

  useEffect(() => { void refreshConvs(); }, []);
  useEffect(() => {
    if (active != null) { void loadMessages(active); setConvCost(0); setDrawerOpen(false); }
    else setMsgs([]);
  }, [active]);
  useEffect(() => {
    const el = scrollerRef.current; if (!el) return;
    const onScroll = () => setShowJump(el.scrollTop + el.clientHeight + 80 < el.scrollHeight);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [active]);
  useEffect(() => {
    if (!showJump) scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  async function refreshConvs() {
    setConvs(await apiFetch("/api/chat/conversations").then((r) => r.json()));
  }

  async function loadMessages(id: number) {
    const j = await apiFetch(`/api/chat/conversations/${id}`).then((r) => r.json());
    setMsgs(j.messages);
  }

  async function startNew() {
    const res = await apiFetch("/api/chat/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    const j = await res.json();
    setActive(j.id);
    setMsgs([]);
    setUsage(null);
    setConvCost(0);
    await refreshConvs();
  }

  async function rename(c: Conv) {
    const next = window.prompt("Rename conversation", c.title);
    if (!next || next === c.title) return;
    await apiFetch(`/api/chat/conversations/${c.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: next }) });
    await refreshConvs();
  }

  async function deleteConv(c: Conv) {
    const ok = await confirm({ title: `Delete "${c.title}"?`, destructive: true, confirmLabel: "Delete" });
    if (!ok) return;
    await apiFetch(`/api/chat/conversations/${c.id}`, { method: "DELETE" });
    if (active === c.id) setActive(null);
    push({ title: "Deleted", variant: "success" });
    await refreshConvs();
  }

  async function send(prompt?: string) {
    const draft = (prompt ?? input).trim();
    if (!draft) return;
    let convId = active;
    if (convId == null) {
      const res = await apiFetch("/api/chat/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const j = await res.json(); convId = j.id; setActive(j.id);
    }
    if (!prompt) setInput("");
    setMsgs((m) => [...m, { role: "user", content: draft }, { role: "assistant", content: "" }]);
    setBusy(true);
    setUsage(null);

    const res = await apiFetch(`/api/chat/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: draft, webSearch, template: template || undefined, provider }),
    });
    if (!res.body) { setBusy(false); return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = ""; let assistantBuf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n\n"); buf = lines.pop() ?? "";
      for (const ln of lines) {
        if (!ln.startsWith("data: ")) continue;
        let evt: any;
        try { evt = JSON.parse(ln.slice(6)); } catch { continue; }
        if (evt.type === "delta") {
          assistantBuf += evt.text;
          setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: assistantBuf }; return c; });
        }
        if (evt.type === "done") {
          setUsage(evt.usage);
          setConvCost((c) => c + (evt.usage?.costUsd ?? 0));
        }
        if (evt.type === "error") {
          assistantBuf += `\n\n[error: ${evt.message}]`;
          setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: assistantBuf }; return c; });
          push({ title: "Stream error", description: evt.message, variant: "destructive" });
        }
      }
    }
    setBusy(false);
    await refreshConvs();
    if (active != null) await loadMessages(active);
  }

  async function regenerate() {
    if (msgs.length === 0 || busy) return;
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMsgs((m) => m.slice(0, -1).concat({ role: "assistant", content: "" }));
    setBusy(true);
    await send(lastUser.content);
  }

  function copy(text: string) { navigator.clipboard.writeText(text); push({ title: "Copied" }); }

  const filteredConvs = useMemo(() => convs, [convs]);

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <ChatSidebar
        items={filteredConvs}
        active={active}
        onSelect={(id) => setActive(id)}
        onNew={startNew}
        onRename={rename}
        onDelete={deleteConv}
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
      />

      <section className="flex h-[calc(100vh-9rem)] flex-col">
        {/* Mobile drawer trigger */}
        <div className="mb-3 flex items-center justify-between lg:hidden">
          <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}><Menu className="mr-1 h-4 w-4" />Conversations</Button>
          {active != null && <Button size="sm" onClick={startNew}><Plus className="mr-1 h-3 w-3" />New</Button>}
        </div>

        {active == null ? (
          <Card>
            <CardContent className="space-y-4 py-10">
              <EmptyState
                icon={<MessageSquare className="h-7 w-7" />}
                title="QA copilot, ready to help"
                description="Ask anything QA-related, generate test cases, or pipe a Jira/Linear ticket in. Toggle web search for grounded answers."
              />
              <div className="mx-auto grid max-w-2xl gap-2 sm:grid-cols-3">
                {STARTER_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => { startNew().then(() => send(p)); }}
                    className="rounded-lg border bg-card p-3 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    <Sparkles className="mb-1 h-3 w-3" />
                    {p}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div ref={scrollerRef} className="relative flex-1 space-y-4 overflow-y-auto rounded border bg-muted/10 p-4">
              {msgs.length === 0 && <p className="text-center text-sm text-muted-foreground">Pick a template below or just type.</p>}
              {msgs.map((m, i) => <MessageBubble key={i} msg={m} onCopy={() => copy(m.content)} />)}
              {showJump && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="sticky bottom-2 left-1/2 -translate-x-1/2 shadow-md"
                  onClick={() => scrollerRef.current?.scrollTo({ top: 1e9, behavior: "smooth" })}
                >
                  <ArrowDown className="mr-1 h-3 w-3" />Jump to latest
                </Button>
              )}
            </div>

            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {TEMPLATES.map((t) => (
                  <Tooltip key={t.id}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant={template === t.id ? "default" : "outline"}
                        onClick={() => setTemplate(template === t.id ? "" : t.id)}
                        aria-pressed={template === t.id}
                      >
                        {t.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t.hint}</TooltipContent>
                  </Tooltip>
                ))}
                <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={webSearch} onCheckedChange={setWebSearch} aria-label="Live web search" />
                  <Globe className="h-3.5 w-3.5" /> Web search
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost">{PROVIDERS.find((p) => p.id === provider)?.label}</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {PROVIDERS.map((p) => (
                      <DropdownMenuItem key={p.id} onSelect={() => setProvider(p.id)}>{p.label}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{usage ? `${usage.inputTokens}+${usage.outputTokens} tok · ${usage.model}` : "ready"}</span>
                <span>Conversation total: <strong className="text-foreground">{formatUSD(convCost)}</strong></span>
              </div>

              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
                  placeholder={template ? `Ask using the ${TEMPLATES.find((t) => t.id === template)?.label} template…` : "Ask anything…"}
                  className="h-20 flex-1 rounded-md border bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Message"
                />
                <div className="flex flex-col gap-2">
                  <Button onClick={() => send()} disabled={busy || !input.trim()}><Send className="mr-1 h-4 w-4" />Send</Button>
                  <Button variant="outline" onClick={regenerate} disabled={busy || msgs.length === 0}><RotateCw className="mr-1 h-3 w-3" />Regenerate</Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">⌘/Ctrl + Enter to send</p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ChatSidebar({ items, active, onSelect, onNew, onRename, onDelete, drawerOpen, setDrawerOpen }: {
  items: Conv[];
  active: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onRename: (c: Conv) => void;
  onDelete: (c: Conv) => void;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
}) {
  const list = (
    <>
      <Button onClick={onNew} className="w-full"><Plus className="mr-1 h-4 w-4" />New chat</Button>
      <ul className="mt-3 space-y-0.5">
        {items.map((c) => (
          <li key={c.id} className={cn(
            "group flex items-center gap-2 rounded px-2 py-1.5 text-sm",
            active === c.id ? "bg-accent" : "hover:bg-accent/50"
          )}>
            <button className="flex-1 truncate text-left" onClick={() => onSelect(c.id)} title={c.title}>{c.title}</button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label={`Actions for ${c.title}`} className="opacity-0 group-hover:opacity-100"><Pencil className="h-3 w-3" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onRename(c)}><Pencil className="mr-2 h-4 w-4" />Rename</DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => onDelete(c)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
        {items.length === 0 && <li className="px-2 py-3 text-xs text-muted-foreground">No conversations yet.</li>}
      </ul>
    </>
  );

  return (
    <>
      <aside className="hidden lg:block">{list}</aside>
      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Conversations">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[80vw] overflow-y-auto bg-background p-4">
            {list}
          </aside>
        </div>
      )}
    </>
  );
}

function MessageBubble({ msg, onCopy }: { msg: Msg; onCopy: () => void }) {
  const isUser = msg.role === "user";
  const sources: Array<{ query: string; results: WebResult[] }> = msg.web_results_json ? (() => { try { return JSON.parse(msg.web_results_json!); } catch { return []; } })() : [];
  return (
    <div className={cn("group flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div className={cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
        isUser ? "bg-primary text-primary-foreground" : "border bg-card"
      )}>
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{isUser ? "You" : "Assistant"}</span>
          {!isUser && (
            <button onClick={onCopy} className="opacity-0 group-hover:opacity-100" aria-label="Copy message">
              <Copy className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="whitespace-pre-wrap font-sans text-sm">{msg.content || <span className="opacity-50">…</span>}</div>
      </div>
      {sources.length > 0 && (
        <div className="ml-1 max-w-[85%] space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Sources</span>
          <div className="grid gap-1 sm:grid-cols-2">
            {sources.flatMap((g) => g.results).map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noreferrer" className="rounded border bg-card px-2 py-1.5 text-xs hover:bg-accent/50">
                <span className="line-clamp-1 font-medium">{r.title || r.url}</span>
                <span className="line-clamp-1 text-muted-foreground">{r.url}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
