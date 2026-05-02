"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Play, Wand2, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Breadcrumb } from "@/components/Breadcrumb";
import { JobStatusRail } from "@/components/JobStatusRail";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api";
import { formatRelative, formatDuration } from "@/lib/utils";
import { useToast } from "@/components/Toaster";

type Run = { id: number; started_at: string; ended_at: string | null; status: string; pass: number; fail: number; total: number };
type ResultRow = { id: number; test_name: string; status: string; error: string | null; duration_ms: number | null };

export default function RunsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<{ name: string } | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [active, setActive] = useState<Run | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [stream, setStream] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [healing, setHealing] = useState<number | null>(null);
  const streamRef = useRef<HTMLPreElement>(null);
  const { push } = useToast();

  useEffect(() => { void load(); }, []);
  useEffect(() => { streamRef.current?.scrollTo({ top: 1e9 }); }, [stream]);

  async function load() {
    const [a, b] = await Promise.all([
      apiFetch(`/api/projects/${id}/runs`).then((r) => r.json()),
      apiFetch(`/api/projects/${id}`).then((r) => r.json()),
    ]);
    setRuns(a); setProject(b);
  }

  async function loadResults(run: Run) {
    setActive(run);
    const r = await apiFetch(`/api/projects/${id}/runs/${run.id}`);
    const j = await r.json();
    setActive(j.run);
    setResults(j.results);
  }

  async function runAll() {
    setBusy(true); setStream([]); setActive(null); setResults([]);
    const res = await apiFetch(`/api/projects/${id}/run`, { method: "POST" });
    if (!res.body) { setBusy(false); return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n\n"); buf = lines.pop() ?? "";
      for (const ln of lines) {
        if (ln.startsWith("data: ")) {
          try {
            const evt = JSON.parse(ln.slice(6));
            setStream((p) => [...p, evt.line ?? `${evt.type}: ${evt.message ?? ""}`]);
          } catch {}
        }
      }
    }
    setBusy(false);
    push({ title: "Run finished", variant: "success" });
    await load();
  }

  async function heal(testResultId: number) {
    setHealing(testResultId);
    const r = await apiFetch(`/api/projects/${id}/heal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ testId: testResultId }) });
    const j = await r.json();
    setHealing(null);
    if (j.ok) push({ title: "Heal proposal saved", description: "Review on the Heals page.", action: { label: "Review", onClick: () => location.assign(`/projects/${id}/heals`) } });
    else      push({ title: "Heal failed", description: j.error, variant: "destructive" });
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Projects", href: "/" }, { label: project?.name ?? "…", href: `/projects/${id}` }, { label: "Runs" }]} />
      <JobStatusRail projectId={Number(id)} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Runs</h1>
          <p className="text-sm text-muted-foreground">Executes your generated Playwright suite. Failed locator-style errors are heal-eligible.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runAll} disabled={busy}>
            <Play className="mr-1 h-4 w-4" />{busy ? "Running…" : "Run all"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={busy} aria-label="More run options"><ChevronDown className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled>Run failed only (coming soon)</DropdownMenuItem>
              <DropdownMenuItem disabled>Run selected (coming soon)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <Card>
          <CardHeader className="pb-3"><CardTitle>History</CardTitle></CardHeader>
          <CardContent>
            {runs === null ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : runs.length === 0 ? (
              <EmptyState title="No runs yet" description="Click Run all to execute the suite." />
            ) : (
              <ul className="divide-y">
                {runs.map((r) => {
                  const dur = r.ended_at ? new Date(r.ended_at).getTime() - new Date(r.started_at).getTime() : null;
                  const pct = r.total > 0 ? Math.round((r.pass / r.total) * 100) : 0;
                  const isActive = active?.id === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => loadResults(r)}
                        className={`flex w-full items-center gap-3 px-1 py-2 text-left text-sm transition-colors hover:bg-accent/50 ${isActive ? "bg-accent" : ""}`}
                      >
                        <Badge variant={r.fail === 0 && r.total > 0 ? "success" : r.fail > 0 ? "destructive" : "outline"}>{r.pass}/{r.total}</Badge>
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-xs">#{r.id} · {pct}% pass</div>
                          <div className="truncate text-[11px] text-muted-foreground">{formatRelative(r.started_at)} · {formatDuration(dur)}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{active ? `Run #${active.id}` : busy ? "Live output" : "Pick a run"}</CardTitle>
            <CardDescription>
              {active ? `${active.pass} pass · ${active.fail} fail · ${active.total} total` : busy ? "Streaming from Playwright" : "Or click Run all to start one."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {active ? (
              <ul className="divide-y">
                {results.map((res) => (
                  <li key={res.id} className="flex items-center gap-3 py-2 text-sm">
                    <Badge variant={res.status === "passed" ? "success" : res.status === "failed" ? "destructive" : "outline"}>{res.status}</Badge>
                    <span className="flex-1 truncate" title={res.test_name}>{res.test_name}</span>
                    {res.duration_ms != null && <span className="text-xs text-muted-foreground">{formatDuration(res.duration_ms)}</span>}
                    {res.status === "failed" && (
                      <Button size="sm" variant="outline" disabled={healing === res.id} onClick={() => heal(res.id)}>
                        <Wand2 className="mr-1 h-3 w-3" />{healing === res.id ? "…" : "Heal"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : busy ? (
              <pre ref={streamRef} className="max-h-[28rem] overflow-auto rounded bg-muted p-3 text-xs">{stream.join("\n") || "—"}</pre>
            ) : (
              <p className="text-sm text-muted-foreground">No run selected.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
