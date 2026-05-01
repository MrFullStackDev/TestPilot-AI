"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Wand2, FileText, Search, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Breadcrumb } from "@/components/Breadcrumb";
import { JobStatusRail } from "@/components/JobStatusRail";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toaster";

type CapturedPage = { id: number; url: string; capture_id: number };
type Test = { id: number; name: string; file_path: string; flaky_flag: number; flaky_reason: string | null };

export default function GeneratePage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<{ name: string; output_dir: string | null } | null>(null);
  const [pages, setPages] = useState<CapturedPage[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tests, setTests] = useState<Test[] | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const { push } = useToast();

  useEffect(() => { void load(); }, []);

  async function load() {
    const [a, b, c] = await Promise.all([
      apiFetch(`/api/projects/${id}/pages?captured=1`).then((r) => r.json()),
      apiFetch(`/api/projects/${id}/tests`).then((r) => r.json()),
      apiFetch(`/api/projects/${id}`).then((r) => r.json()),
    ]);
    setPages(a); setTests(b); setProject(c);
  }

  async function generate() {
    if (selected.size === 0) return;
    setBusy(true); setProgress("Starting…");
    const res = await apiFetch(`/api/projects/${id}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageIds: Array.from(selected) }),
    });
    if (!res.body) { setBusy(false); return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let testCount = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n\n"); buf = lines.pop() ?? "";
      for (const ln of lines) {
        if (!ln.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(ln.slice(6));
          if (evt.message) setProgress(evt.message);
          if (evt.type === "ok") testCount = evt.testCount ?? 0;
          if (evt.type === "error") push({ title: "Generation failed", description: evt.message, variant: "destructive" });
        } catch {}
      }
    }
    setBusy(false); setProgress(null);
    if (testCount > 0) push({ title: `Generated ${testCount} tests`, variant: "success" });
    setSelected(new Set());
    await load();
  }

  function toggle(pid: number) { setSelected((s) => { const n = new Set(s); n.has(pid) ? n.delete(pid) : n.add(pid); return n; }); }

  const filteredTests = (tests ?? []).filter((t) => !filter || t.name.toLowerCase().includes(filter.toLowerCase()));

  // Estimated cost: ~3,000 input tokens per page (post-trim) + 6k output for plan.
  const estimatedTokens = selected.size * 3000;
  const planTokens = 6000;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Projects", href: "/" }, { label: project?.name ?? "…", href: `/projects/${id}` }, { label: "Generate" }]} />
      <JobStatusRail projectId={Number(id)} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Generate tests</h1>
          <p className="text-sm text-muted-foreground">Analyse captured pages, propose a test plan, emit a runnable Playwright project.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={generate} disabled={busy || selected.size === 0}>
            <Wand2 className="mr-1 h-4 w-4" />
            {busy ? "Generating…" : selected.size > 0 ? `Generate from ${selected.size}` : "Select pages first"}
          </Button>
          {selected.size > 0 && (
            <span className="text-xs text-muted-foreground">≈ {estimatedTokens.toLocaleString()} input + {planTokens.toLocaleString()} output tokens</span>
          )}
        </div>
      </div>

      {progress && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3 text-sm">
            <Wand2 className="h-4 w-4 animate-pulse" /> {progress}
          </CardContent>
        </Card>
      )}

      <div className={`grid gap-4 ${(tests?.length ?? 0) > 0 ? "lg:grid-cols-2" : ""}`}>
        <Card>
          <CardHeader>
            <CardTitle>Captured pages {pages ? `(${pages.length})` : ""}</CardTitle>
            <CardDescription>Pick the pages whose elements should drive tests.</CardDescription>
          </CardHeader>
          <CardContent>
            {pages === null ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : pages.length === 0 ? (
              <EmptyState
                title="No captures yet"
                description="Crawl some pages first."
                action={<Button asChild variant="outline"><a href={`/projects/${id}/crawl`}>Open crawl →</a></Button>}
              />
            ) : (
              <ul className="divide-y">
                {pages.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={p.url} />
                    <span className="flex-1 truncate" title={p.url}>{p.url}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {(tests?.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Tests {tests ? `(${tests.length})` : ""}</CardTitle>
                  <CardDescription>{project?.output_dir ? <code className="text-xs">{project.output_dir}</code> : "Project not yet emitted."}</CardDescription>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input className="h-9 w-44 pl-8" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter tests" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {filteredTests.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    <a href={`/projects/${id}/tests/${t.id}`} className="flex-1 truncate hover:underline" title={t.name}>{t.name}</a>
                    {t.flaky_flag ? (
                      <Badge variant="warning" title={t.flaky_reason ?? undefined}><AlertTriangle className="mr-1 h-3 w-3" />flaky</Badge>
                    ) : null}
                    <code className="hidden text-[10px] text-muted-foreground sm:inline">{t.file_path}</code>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
