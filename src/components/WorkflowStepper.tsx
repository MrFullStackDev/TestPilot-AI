"use client";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Step = { key: string; label: string; href: string; done: boolean; current?: boolean; meta?: string };

export function WorkflowStepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 rounded-lg border bg-card p-2 text-xs">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1">
          <Link
            href={s.href}
            aria-current={s.current ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
              s.current ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              s.done && !s.current && "text-foreground/80"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid h-5 w-5 place-items-center rounded-full border text-[10px] font-semibold",
                s.done ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400" :
                s.current ? "border-primary bg-primary text-primary-foreground" :
                "border-muted-foreground/30"
              )}
            >
              {s.done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className="font-medium">{s.label}</span>
            {s.meta && <span className="text-muted-foreground">· {s.meta}</span>}
          </Link>
          {i < steps.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
