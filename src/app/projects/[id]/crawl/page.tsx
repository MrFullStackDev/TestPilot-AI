"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Search, Trash2, RefreshCw, ExternalLink } from "lucide-react";
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
import { useConfirm } from "@/components/ConfirmDialog";

type DiscoveredPage = { id: number; url: string; status: string };

export default function CrawlPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [project, setProject] = useState<{ name: string; root_url: string } | null>(null);
  const [pages, setPages] = useState<DiscoveredPage[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [filter, setFilter] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const { push } = useToast();
  const confirm = useConfirm();

  useEffect(() => { void load(); void loadProject(); }, []);

  async function loadProject() {
    const r = await apiFetch(`/api/projects/${id}`);
    if (r.ok) setProject(await r.json());
  }

  async function load() {
    setPages(null);
    const r = await apiFetch(`/api/projects/${id}/pages`);
    setPages(await r.json());
  }

  async function discover() {
    setDiscovering(true);
    const res = await apiFetch(`/api/projects/${id}/discover`, { method: "POST" });
    setDiscovering(false);
    if (res.ok) { const j = await res.json(); push({ title: `Discovered ${j.count} URLs`, variant: "success" }); await load(); }
    else        { push({ title: "Discover failed", description: (await res.json()).error, variant: "destructive" }); }
  }

  async function crawlSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    const res = await apiFetch(`/api/projects/${id}/crawl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageIds: Array.from(selected) }),
    });
    if (!res.body) { setBusy(false); return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let okCount = 0; let failCount = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n\n"); buf = lines.pop() ?? "";
      for (const ln of lines) {
        if (!ln.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(ln.slice(6));
          if (evt.type === "captured") okCount++;
          if (evt.type === "fail") failCount++;
        } catch {}
      }
    }
    setBusy(false);
    push({
      title: `Crawl finished`,
      description: `${okCount} captured · ${failCount} failed`,
      variant: failCount > 0 ? "destructive" : "success",
    });
    setSelected(new Set());
    await load();
  }

  async function addManual() {
    if (!addUrl.trim()) return;
    const r = await apiFetch(`/api/projects/${id}/pages`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: addUrl.trim() }),
    });
    if (r.ok) { setAddUrl(""); push({ title: "URL added", variant: "success" }); await load(); }
    else      { push({ title: "Could not add", description: (await r.json()).error, variant: "destructive" }); }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: `Delete ${selected.size} page${selected.size === 1 ? "" : "s"}?`,
      description: "Removes the URL and any captures associated with it. The remote site is not affected.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    for (const pid of selected) {
      await apiFetch(`/api/projects/${id}/pages/${pid}`, { method: "DELETE" });
    }
    setSelected(new Set());
    push({ title: "Deleted", variant: "success" });
    await load();
  }

  function toggle(pid: number) { setSelected((s) => { const n = new Set(s); n.has(pid) ? n.delete(pid) : n.add(pid); return n; }); }
  function toggleAll() {
    if (!filtered) return;
    const ids = filtered.map((p) => p.id);
    if (ids.every((i) => selected.has(i))) setSelected(new Set());
    else setSelected(new Set(ids));
  }

  const filtered = useMemo(() =>
    pages ? pages.filter((p) => !filter || p.url.toLowerCase().includes(filter.toLowerCase())) : null,
  [pages, filter]);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Projects", href: "/" }, { label: project?.name ?? "…", href: `/projects/${id}` }, { label: "Crawl" }]} />
      <JobStatusRail projectId={Number(id)} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Crawl</h1>
          <p className="text-sm text-muted-foreground">
            Discover URLs from <code className="text-xs">{project?.root_url ?? ""}</code>'s sitemap and DOM, then capture the ones that matter.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={discover} disabled={discovering || busy}>
            <RefreshCw className={`mr-1 h-4 w-4 ${discovering ? "animate-spin" : ""}`} />
            {discovering ? "Discovering…" : "Discover URLs"}
          </Button>
          <Button onClick={crawlSelected} disabled={busy || selected.size === 0}>
            {busy ? "Capturing…" : selected.size > 0 ? `Capture ${selected.size}` : "Capture selected"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Pages {filtered ? `(${filtered.length})` : ""}</CardTitle>
              <CardDescription>Pick what to capture. Same-origin only.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input className="h-9 w-56 pl-8" placeholder="Filter URLs…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter pages" />
              </div>
              {selected.size > 0 && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear ({selected.size})</Button>
                  <Button size="sm" variant="outline" onClick={deleteSelected}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            onSubmit={(e) => { e.preventDefault(); void addManual(); }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Plus className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                className="h-9 pl-8"
                placeholder={`Add a URL on ${project?.root_url ?? "this site"}…`}
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                aria-label="Add URL manually"
              />
            </div>
            <Button type="submit" variant="outline" size="sm" disabled={!addUrl.trim()}>Add</Button>
          </form>

          {pages === null ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : filtered && filtered.length === 0 ? (
            <EmptyState
              title={filter ? "No URLs match" : "Nothing yet"}
              description={filter ? "Try a different filter." : "Click Discover URLs to fetch the sitemap and harvest links from the root page, or add one manually above."}
              action={<Button variant="outline" onClick={discover}><RefreshCw className="mr-1 h-4 w-4" />Discover URLs</Button>}
            />
          ) : (
            <ul className="divide-y rounded-md border">
              <li className="flex items-center gap-3 bg-muted/30 px-3 py-2 text-xs">
                <input type="checkbox"
                  checked={!!filtered && filtered.length > 0 && filtered.every((p) => selected.has(p.id))}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
                <span className="text-muted-foreground">URL</span>
                <span className="ml-auto text-muted-foreground">Status</span>
              </li>
              {filtered!.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.url}`} />
                  <span className="flex-1 truncate" title={p.url}>{p.url}</span>
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={`Open ${p.url}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <Badge variant={p.status === "captured" ? "success" : p.status === "failed" ? "destructive" : "outline"}>{p.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
