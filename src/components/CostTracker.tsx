"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUSD } from "@/lib/cost";

type CostInfo = {
  total: number;
  budget: number;
  byProvider: Array<{ provider: string; model: string; calls: number; in_tok: number; out_tok: number; cached: number; cost: number }>;
  byPurpose: Array<{ purpose: string; calls: number; cost: number }>;
};

export function CostTracker({ projectId }: { projectId: number | string }) {
  const [cost, setCost] = useState<CostInfo | null>(null);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/cost`).then((r) => r.json()).then(setCost);
  }, [projectId]);

  if (!cost) return null;
  const pct = cost.budget > 0 ? Math.min(100, Math.round((cost.total / cost.budget) * 100)) : 0;
  const variant = pct >= 100 ? "destructive" : pct >= 80 ? "warning" : "success";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>LLM cost</span>
          <Badge variant={variant}>{formatUSD(cost.total)} / {formatUSD(cost.budget)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full ${pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
        </div>
        {cost.byProvider.length > 0 && (
          <ul className="divide-y">
            {cost.byProvider.map((p, i) => (
              <li key={i} className="flex items-center gap-3 py-1.5">
                <span className="flex-1 truncate font-mono text-xs">{p.provider} · {p.model}</span>
                <span className="text-xs text-muted-foreground">{p.calls} calls</span>
                <span className="font-mono text-xs">{formatUSD(p.cost)}</span>
              </li>
            ))}
          </ul>
        )}
        {cost.byPurpose.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">By purpose</summary>
            <ul className="mt-1 divide-y">
              {cost.byPurpose.map((p, i) => (
                <li key={i} className="flex items-center gap-3 py-1">
                  <span className="flex-1 truncate font-mono">{p.purpose}</span>
                  <span>{p.calls}×</span>
                  <span className="font-mono">{formatUSD(p.cost)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
