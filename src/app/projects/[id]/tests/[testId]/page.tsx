"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Lock, Unlock, FileText, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDots } from "@/components/ui/sparkline";
import { Breadcrumb } from "@/components/Breadcrumb";
import { apiFetch } from "@/lib/api";
import { formatRelative, formatDuration } from "@/lib/utils";
import { useToast } from "@/components/Toaster";

type Test = { id: number; name: string; file_path: string; flaky_flag: number; flaky_reason: string | null; quarantined: number };
type Result = { id: number; status: string; duration_ms: number | null; error: string | null; run_id: number };

export default function TestDetail() {
  const { id, testId } = useParams<{ id: string; testId: string }>();
  const [project, setProject] = useState<{ name: string; output_dir: string | null } | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  useEffect(() => { void load(); }, []);

  async function load() {
    const [tRes, rRes, pRes] = await Promise.all([
      apiFetch(`/api/projects/${id}/tests`).then((r) => r.json()),
      apiFetch(`/api/projects/${id}/tests/${testId}/results`).then((r) => r.json()),
      apiFetch(`/api/projects/${id}`).then((r) => r.json()),
    ]);
    setTest(tRes.find((t: Test) => t.id === Number(testId)) ?? null);
    setResults(rRes);
    setProject(pRes);
  }

  async function quarantine(on: boolean) {
    setBusy(true);
    const r = await apiFetch(`/api/projects/${id}/tests/${testId}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ quarantined: on }),
    });
    setBusy(false);
    if (r.ok) { push({ title: on ? "Quarantined" : "Unquarantined", variant: "success" }); await load(); }
    else      { push({ title: "Could not update", variant: "destructive" }); }
  }

  if (!test && results !== null) return (
    <EmptyState title="Test not found" description="It may have been regenerated. Open Generate to refresh." />
  );

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: "Projects", href: "/" },
        { label: project?.name ?? "…", href: `/projects/${id}` },
        { label: "Tests", href: `/projects/${id}/generate` },
        { label: test?.name ?? "…" },
      ]} />

      {test ? (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{test.name}</h1>
            {test.flaky_flag ? <Badge variant="warning"><AlertTriangle className="mr-1 h-3 w-3" />flaky</Badge> : null}
            {test.quarantined ? <Badge variant="destructive"><Lock className="mr-1 h-3 w-3" />quarantined</Badge> : null}
          </div>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" /> <code>{test.file_path}</code>
            {project?.output_dir && (
              <button
                className="hover:text-foreground hover:underline"
                onClick={() => { navigator.clipboard.writeText(`${project.output_dir}/${test.file_path}`); push({ title: "Path copied" }); }}
              >Copy absolute path</button>
            )}
          </p>
          {test.flaky_reason && <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-400">{test.flaky_reason}</p>}
        </div>
      ) : (
        <Skeleton className="h-12 w-full" />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {test?.quarantined ? (
          <Button variant="outline" onClick={() => quarantine(false)} disabled={busy}>
            <Unlock className="mr-1 h-4 w-4" />Unquarantine
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => quarantine(true)} disabled={busy}>
            <Lock className="mr-1 h-4 w-4" />Quarantine
          </Button>
        )}
        {results && results.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Last 20 runs:
            <StatusDots statuses={results.slice(0, 20).map((r) => r.status)} />
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>{results?.length ?? 0} results</CardDescription>
        </CardHeader>
        <CardContent>
          {results === null ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No results yet.</p>
          ) : (
            <ul className="divide-y">
              {results.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                  <Badge variant={r.status === "passed" ? "success" : r.status === "failed" ? "destructive" : "outline"}>{r.status}</Badge>
                  <span className="text-xs text-muted-foreground">run #{r.run_id}</span>
                  {r.duration_ms != null && <span className="text-xs text-muted-foreground">{formatDuration(r.duration_ms)}</span>}
                  {r.error && <span className="flex-1 truncate text-xs text-destructive" title={r.error}>{r.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
