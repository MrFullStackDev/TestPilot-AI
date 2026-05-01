"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ExternalLink, ArrowRight, Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch, readByok } from "@/lib/api";
import { useToast } from "@/components/Toaster";

type Ticket =
  | { source: "linear"; issue: { identifier: string; title: string; description: string | null; url: string; state: string; team: string; assignee: string | null } }
  | { source: "jira"; issue: { key: string; summary: string; description: string; url: string; status: string; type: string; assignee: string | null } };

type Recent = { source: "linear" | "jira"; key: string; title: string; at: number };
const STORAGE_RECENT = "ai-qa-assistant.recentTickets";

function readRecents(): Recent[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_RECENT) || "[]"); } catch { return []; }
}
function writeRecents(r: Recent[]) {
  localStorage.setItem(STORAGE_RECENT, JSON.stringify(r.slice(0, 10)));
}

export default function TicketsPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [piping, setPiping] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [tokens, setTokens] = useState({ jira: false, linear: false });
  const { push } = useToast();

  useEffect(() => {
    const s = readByok();
    setTokens({ jira: !!(s.integrations.jiraToken && s.integrations.jiraEmail && s.integrations.jiraBaseUrl), linear: !!s.integrations.linearToken });
    setRecents(readRecents());
  }, []);

  async function fetchTicket(value?: string) {
    const q = (value ?? input).trim();
    if (!q) return;
    setBusy(true); setTicket(null);
    try {
      const res = await apiFetch("/api/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: q }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "failed");
      setTicket(j);
      const key = j.source === "jira" ? j.issue.key : j.issue.identifier;
      const title = j.source === "jira" ? j.issue.summary : j.issue.title;
      const newR: Recent = { source: j.source, key, title, at: Date.now() };
      const next = [newR, ...recents.filter((r) => !(r.source === newR.source && r.key === newR.key))].slice(0, 10);
      setRecents(next);
      writeRecents(next);
    } catch (e: any) { push({ title: "Fetch failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }

  async function generateTests() {
    if (!ticket) return;
    setPiping(true);
    try {
      const conv = await apiFetch("/api/chat/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: ticketTitle(ticket) }) });
      const { id } = await conv.json();
      // Fire-and-navigate: don't drain the stream here, let chat page render it.
      apiFetch(`/api/chat/conversations/${id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: ticketAsPrompt(ticket), template: "test-cases" }),
      }).catch(() => {});
      // Give the request a tick to start so the page picks it up via streaming on load.
      setTimeout(() => router.push(`/chat?c=${id}`), 200);
    } catch (e: any) {
      push({ title: "Could not generate", description: e.message, variant: "destructive" });
      setPiping(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground">Fetch a Jira or Linear ticket by URL or key. One click → test plan.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={tokens.linear ? "success" : "outline"}>Linear {tokens.linear ? "✓" : "—"}</Badge>
          <Badge variant={tokens.jira ? "success" : "outline"}>Jira {tokens.jira ? "✓" : "—"}</Badge>
          {(!tokens.jira || !tokens.linear) && (
            <Button size="sm" variant="outline" asChild><Link href="/settings"><SettingsIcon className="mr-1 h-3.5 w-3.5" />Configure</Link></Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardHeader>
            <CardTitle>Lookup</CardTitle>
            <CardDescription>Auto-detects Jira vs Linear from URL or your configured tokens.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="ticket-input">URL or key</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="ticket-input"
                  className="pl-8"
                  placeholder="ABC-123"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void fetchTicket(); }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Examples: <code>ABC-123</code> · <code>https://linear.app/team/issue/ABC-123</code> · <code>https://acme.atlassian.net/browse/ABC-123</code>
              </p>
            </div>
            <Button onClick={() => fetchTicket()} disabled={busy || !input.trim()}>{busy ? "Fetching…" : "Fetch ticket"}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent</CardTitle></CardHeader>
          <CardContent>
            {recents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent tickets yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {recents.map((r) => (
                  <li key={`${r.source}-${r.key}-${r.at}`}>
                    <button
                      onClick={() => { setInput(r.key); void fetchTicket(r.key); }}
                      className="flex w-full items-center gap-2 py-2 text-left hover:underline"
                    >
                      <Badge variant="outline" className="capitalize">{r.source}</Badge>
                      <span className="font-mono text-xs">{r.key}</span>
                      <span className="flex-1 truncate text-xs text-muted-foreground">{r.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {busy && <Skeleton className="h-48 w-full" />}

      {!busy && !ticket && recents.length === 0 && (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No ticket fetched yet"
          description={
            !tokens.jira && !tokens.linear ? "Add a Linear API key or Jira credentials in Settings to get started." :
            "Paste a URL or key above, hit Enter."
          }
          action={!tokens.jira && !tokens.linear ? <Button asChild variant="outline"><Link href="/settings">Open Settings</Link></Button> : null}
        />
      )}

      {ticket && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="capitalize">{ticket.source}</Badge>
              <CardTitle className="text-base">{ticketTitle(ticket)}</CardTitle>
            </div>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <a href={ticket.issue.url} target="_blank" rel="noreferrer" className="text-blue-700 underline dark:text-blue-400">
                {ticket.source === "jira" ? ticket.issue.key : ticket.issue.identifier}
                <ExternalLink className="ml-1 inline h-3 w-3" />
              </a>
              <span>·</span>
              <span>{ticket.source === "jira" ? ticket.issue.status : ticket.issue.state}</span>
              {ticket.source === "jira" && ticket.issue.type && <><span>·</span><span>{ticket.issue.type}</span></>}
              {ticket.issue.assignee && <><span>·</span><span>{ticket.issue.assignee}</span></>}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{ticketBody(ticket) || "(no description)"}</pre>
            <Button onClick={generateTests} disabled={piping}>
              {piping ? "Opening chat…" : "Generate test cases"}<ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ticketTitle(t: Ticket): string {
  return t.source === "jira" ? t.issue.summary : t.issue.title;
}
function ticketBody(t: Ticket): string {
  return t.source === "jira" ? t.issue.description : (t.issue.description ?? "");
}
function ticketAsPrompt(t: Ticket): string {
  const id = t.source === "jira" ? t.issue.key : t.issue.identifier;
  const title = ticketTitle(t);
  const body = ticketBody(t) || "(no description)";
  return `Generate test cases for ${t.source.toUpperCase()} ${id}.\n\nTitle: ${title}\n\nDescription:\n${body}\n\nProduce a comprehensive test plan covering happy paths, edge cases, error states, and accessibility. Use clear numbered steps with explicit expected results.`;
}
