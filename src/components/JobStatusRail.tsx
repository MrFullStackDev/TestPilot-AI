"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import { useToast } from "@/components/Toaster";

type Job = { id: string; kind: "crawl" | "generate" | "run" | "heal"; projectId: number; startedAt: number; status: string };

export function JobStatusRail({ projectId }: { projectId?: number }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const { push } = useToast();

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const url = projectId ? `/api/jobs?projectId=${projectId}` : "/api/jobs";
        const r = await apiFetch(url);
        const j = (await r.json()) as Job[];
        if (alive) setJobs(j.filter((x) => x.status === "running"));
      } catch {}
    }
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [projectId]);

  if (jobs.length === 0) return null;

  return (
    <div className="sticky top-14 z-30 -mx-4 mb-4 flex flex-wrap items-center gap-3 border-b bg-background/80 px-4 py-2 backdrop-blur md:mx-0 md:rounded-md md:border">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm font-medium">Running</span>
      {jobs.map((j) => (
        <Badge key={j.id} variant="secondary" className="capitalize">{j.kind}</Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        onClick={async () => {
          for (const j of jobs) {
            await apiFetch(`/api/jobs/${j.id}`, { method: "DELETE" });
          }
          push({ title: "Cancellation requested", variant: "default" });
        }}
      >
        <X className="mr-1 h-3 w-3" /> Cancel all
      </Button>
    </div>
  );
}
