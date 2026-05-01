import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card/50 px-6 py-12 text-center", className)}>
      {icon && <div className="text-muted-foreground" aria-hidden>{icon}</div>}
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
