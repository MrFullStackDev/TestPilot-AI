"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { formatRelative } from "@/lib/utils";

type Activity =
  | { kind: "run"; id: number; at: string; status: string; pass: number; total: number }
  | { kind: "heal"; id: number; at: string; accepted: number }
  | { kind: "capture"; pageId: number; at: string; url: string };

export function ProjectActivity({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<Activity[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await apiFetch(`/api/projects/${projectId}/activity`);
      if (alive) setItems(await r.json());
    })();
    return () => { alive = false; };
  }, [projectId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
        <CardDescription>Last few captures, generations, runs, and heals.</CardDescription>
      </CardHeader>
      <CardContent>
        {items === null ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {items.map((a, i) => <li key={i} className="flex items-center gap-3 py-2">{render(a, projectId)}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function render(a: Activity, projectId: number): React.ReactNode {
  if (a.kind === "run") return (
    <>
      <Badge variant={a.status === "passed" ? "success" : "destructive"}>run</Badge>
      <Link href={`/projects/${projectId}/runs`} className="flex-1 truncate hover:underline">#{a.id} · {a.pass}/{a.total} {a.status}</Link>
      <span className="text-xs text-muted-foreground">{formatRelative(a.at)}</span>
    </>
  );
  if (a.kind === "heal") return (
    <>
      <Badge variant={a.accepted ? "success" : "warning"}>heal</Badge>
      <Link href={`/projects/${projectId}/heals`} className="flex-1 hover:underline">{a.accepted ? "accepted" : "pending review"}</Link>
      <span className="text-xs text-muted-foreground">{formatRelative(a.at)}</span>
    </>
  );
  return (
    <>
      <Badge variant="secondary">capture</Badge>
      <Link href={`/projects/${projectId}/crawl`} className="flex-1 truncate hover:underline">{a.url}</Link>
      <span className="text-xs text-muted-foreground">{formatRelative(a.at)}</span>
    </>
  );
}
