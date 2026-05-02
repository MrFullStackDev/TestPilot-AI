"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Wand2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Breadcrumb } from "@/components/Breadcrumb";
import { apiFetch } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import { useToast } from "@/components/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

type HealEvent = {
  id: number;
  test_name: string;
  old_locator: string;
  new_locator: string;
  rationale: string;
  accepted: number;
  created_at: string;
};

export default function HealsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<{ name: string } | null>(null);
  const [events, setEvents] = useState<HealEvent[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { push } = useToast();
  const confirm = useConfirm();

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!events || events.length === 0) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const pending = events.filter((e) => !e.accepted);
      if (pending.length === 0) return;
      const idx = Math.max(0, Math.min(activeIdx, pending.length - 1));
      const ev = pending[idx];
      if (!ev) return;
      if (e.key === "j") setActiveIdx((i) => Math.min(i + 1, pending.length - 1));
      else if (e.key === "k") setActiveIdx((i) => Math.max(i - 1, 0));
      else if (e.key === "a") void decide(ev.id, "accept");
      else if (e.key === "r") void decide(ev.id, "reject");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [events, activeIdx]);

  async function load() {
    const [a, b] = await Promise.all([
      apiFetch(`/api/projects/${id}/heal`).then((r) => r.json()),
      apiFetch(`/api/projects/${id}`).then((r) => r.json()),
    ]);
    setEvents(a); setProject(b);
  }

  async function decide(eventId: number, action: "accept" | "reject") {
    if (action === "reject") {
      const ok = await confirm({ title: "Reject this proposal?", description: "It will be deleted. You can heal again from the runs page.", confirmLabel: "Reject", destructive: true });
      if (!ok) return;
    }
    setBusyId(eventId);
    const r = await apiFetch(`/api/projects/${id}/heal`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId, action }),
    });
    setBusyId(null);
    if (r.ok) {
      push({ title: action === "accept" ? "Heal applied" : "Proposal rejected", variant: "success" });
      await load();
    } else {
      push({ title: "Action failed", variant: "destructive" });
    }
  }

  const pending = (events ?? []).filter((e) => !e.accepted);
  const decided = (events ?? []).filter((e) => e.accepted);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Projects", href: "/" }, { label: project?.name ?? "…", href: `/projects/${id}` }, { label: "Heals" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Heal proposals</h1>
          <p className="text-sm text-muted-foreground">Every locator change is reviewed before it lands. Use <kbd>j</kbd>/<kbd>k</kbd> to navigate, <kbd>a</kbd> to accept, <kbd>r</kbd> to reject.</p>
        </div>
        {pending.length > 0 && <Badge variant="warning">{pending.length} pending</Badge>}
      </div>

      {events === null ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : pending.length === 0 && decided.length === 0 ? (
        <EmptyState
          icon={<Wand2 className="h-6 w-6" />}
          title="No heal events"
          description="When a locator-style failure is healed (fast-path or LLM), the proposal lands here for your review."
        />
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Pending review</h2>
              {pending.map((e, i) => (
                <HealCard
                  key={e.id}
                  e={e}
                  active={i === activeIdx}
                  busy={busyId === e.id}
                  onAccept={() => decide(e.id, "accept")}
                  onReject={() => decide(e.id, "reject")}
                />
              ))}
            </div>
          )}
          {decided.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">{decided.length} previously accepted</summary>
              <div className="mt-3 space-y-3">
                {decided.map((e) => <HealCard key={e.id} e={e} active={false} busy={false} onAccept={() => {}} onReject={() => {}} readOnly />)}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function HealCard({ e, active, busy, onAccept, onReject, readOnly }: {
  e: HealEvent; active: boolean; busy: boolean;
  onAccept: () => void; onReject: () => void; readOnly?: boolean;
}) {
  const oldL = JSON.parse(e.old_locator) as { key: string; strategy: string; value: string };
  const newL = JSON.parse(e.new_locator) as { key: string; strategy: string; value: string };
  return (
    <Card className={active ? "border-primary/60 ring-1 ring-primary/30" : ""}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{e.test_name}</CardTitle>
            <CardDescription className="font-mono text-xs">{oldL.key} · {formatRelative(e.created_at)}</CardDescription>
          </div>
          {readOnly ? <Badge variant="success">accepted</Badge> : <Badge variant="warning">pending</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded border bg-destructive/5 p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Old</div>
            <div className="font-mono text-xs"><span className="text-muted-foreground">{oldL.strategy}:</span> {oldL.value}</div>
          </div>
          <div className="rounded border bg-green-500/5 p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">New</div>
            <div className="font-mono text-xs"><span className="text-muted-foreground">{newL.strategy}:</span> {newL.value}</div>
          </div>
        </div>
        {e.rationale && <p className="text-sm text-muted-foreground">{e.rationale}</p>}
        {!readOnly && (
          <div className="flex gap-2">
            <Button size="sm" onClick={onAccept} disabled={busy}><Check className="mr-1 h-3 w-3" />Accept</Button>
            <Button size="sm" variant="outline" onClick={onReject} disabled={busy}><X className="mr-1 h-3 w-3" />Reject</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
