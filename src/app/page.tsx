"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, MoreHorizontal, Trash2, Pencil, ExternalLink, AlertTriangle, Check, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api";
import { cn, formatRelative } from "@/lib/utils";
import { formatUSD } from "@/lib/cost";
import { useToast } from "@/components/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

type Summary = {
  id: number;
  slug: string;
  name: string;
  root_url: string;
  framework: string | null;
  created_at: string;
  test_count: number;
  flaky_count: number;
  pending_heals: number;
  cost_usd: number;
  last_capture_at: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_pass: number | null;
  last_run_total: number | null;
};

type SortKey = "recent" | "name" | "tests";

const SORT_LABELS: Record<SortKey, string> = { recent: "Recent", name: "Name", tests: "Tests" };

export default function HomePage() {
  const [items, setItems] = useState<Summary[] | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const { push } = useToast();
  const confirm = useConfirm();

  useEffect(() => { void load(); }, []);

  async function load() {
    setItems(null);
    const r = await apiFetch("/api/projects/summaries");
    setItems(await r.json());
  }

  async function rename(p: Summary) {
    const next = window.prompt("New project name", p.name);
    if (!next || next === p.name) return;
    const r = await apiFetch(`/api/projects/${p.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: next }) });
    if (r.ok) { push({ title: "Renamed", variant: "success" }); await load(); }
    else      { push({ title: "Rename failed", description: (await r.json()).error, variant: "destructive" }); }
  }

  async function deleteProject(p: Summary) {
    const ok = await confirm({
      title: `Delete "${p.name}"?`,
      description: "Removes the project, captures, runs, and tests metadata. The on-disk generated Playwright project under data/projects/ stays intact.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const r = await apiFetch(`/api/projects/${p.id}`, { method: "DELETE" });
    if (r.ok) { push({ title: "Project deleted", variant: "success" }); await load(); }
    else      { push({ title: "Delete failed", variant: "destructive" }); }
  }

  const filtered = (items ?? []).filter((p) =>
    !filter || p.name.toLowerCase().includes(filter.toLowerCase()) || p.root_url.toLowerCase().includes(filter.toLowerCase())
  );
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "tests") return b.test_count - a.test_count;
    return new Date(b.last_run_at ?? b.last_capture_at ?? b.created_at).getTime()
         - new Date(a.last_run_at ?? a.last_capture_at ?? a.created_at).getTime();
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Crawl a site, generate self-healing Playwright tests, run them.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 w-44" aria-label="Filter projects" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1" aria-label="Sort by">
                Sort: {SORT_LABELS[sort]}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <DropdownMenuItem key={k} onSelect={() => setSort(k)} className="pl-7">
                  {sort === k && <Check className="absolute left-2 h-3.5 w-3.5" aria-hidden />}
                  {SORT_LABELS[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild><Link href="/projects/new"><Plus className="mr-1 h-4 w-4" />New project</Link></Button>
        </div>
      </div>

      {items === null ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          title={filter ? "No matches" : "No projects yet"}
          description={filter ? "Try a different filter." : "Point at a site and we'll crawl, analyse, and generate a Playwright project for you."}
          action={!filter ? <Button asChild><Link href="/projects/new"><Plus className="mr-1 h-4 w-4" />Create your first project</Link></Button> : null}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((p) => <ProjectCard key={p.id} p={p} onRename={() => rename(p)} onDelete={() => deleteProject(p)} />)}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ p, onRename, onDelete }: { p: Summary; onRename: () => void; onDelete: () => void }) {
  const status = p.last_run_status;
  const pass = p.last_run_pass ?? 0;
  const total = p.last_run_total ?? 0;
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      <Link href={`/projects/${p.id}`} className="block focus:outline-none">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 pr-8">
            <CardTitle className="line-clamp-1 text-base">{p.name}</CardTitle>
            {p.framework && <Badge variant="outline" className="shrink-0 capitalize">{p.framework}</Badge>}
          </div>
          <p className="line-clamp-1 text-xs text-muted-foreground">{p.root_url}</p>
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Stat label="Tests" value={p.test_count} />
            <Stat
              label="Flaky"
              value={p.flaky_count}
              tone={p.flaky_count > 0 ? "warn" : undefined}
              icon={p.flaky_count > 0 ? <AlertTriangle className="h-3 w-3" aria-hidden /> : undefined}
            />
            <Stat label="Cost" value={formatUSD(p.cost_usd)} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {status ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${status === "passed" ? "bg-green-500" : "bg-destructive"}`} />
                    {pass}/{total} {status}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Last run · {formatRelative(p.last_run_at)}</TooltipContent>
              </Tooltip>
            ) : (
              <span>Not run yet</span>
            )}
            {p.pending_heals > 0 && (
              <Badge variant="warning">{p.pending_heals} heal{p.pending_heals === 1 ? "" : "s"} pending</Badge>
            )}
            <span className="ml-auto">Active {formatRelative(p.last_run_at ?? p.last_capture_at ?? p.created_at)}</span>
          </div>
        </CardContent>
      </Link>

      <div className={cn(
        "absolute right-2 top-2 transition-opacity",
        menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
      )}>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Project actions"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRename}><Pencil className="mr-2 h-4 w-4" />Rename</DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={p.root_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open root URL</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}><Trash2 className="mr-2 h-4 w-4" />Delete…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: React.ReactNode; tone?: "warn"; icon?: React.ReactNode }) {
  return (
    <div className={`rounded-md border bg-muted/30 px-2 py-1.5 ${tone === "warn" ? "border-yellow-300/60 bg-yellow-50/40 dark:bg-yellow-950/20" : ""}`}>
      <div className={`flex items-center justify-center gap-1 text-base font-semibold ${tone === "warn" ? "text-yellow-800 dark:text-yellow-300" : ""}`}>
        {icon}<span>{value}</span>
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
