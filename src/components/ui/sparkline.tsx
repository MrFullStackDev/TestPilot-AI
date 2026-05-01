// Tiny inline sparkline for status sequences. Each value: 1 = pass, 0 = fail.
export function Sparkline({ values, width = 120, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const max = Math.max(...values, 1);
  const dx = width / Math.max(values.length, 1);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden>
      {values.map((v, i) => {
        const h = (v / max) * height;
        return (
          <rect
            key={i}
            x={i * dx + 1}
            y={height - h}
            width={Math.max(dx - 2, 1)}
            height={h}
            className={v > 0 ? "fill-green-500" : "fill-destructive"}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

// Pass/fail dots — better when each datapoint is a categorical status.
export function StatusDots({ statuses, max = 20 }: { statuses: ("passed" | "failed" | string)[]; max?: number }) {
  const recent = statuses.slice(-max);
  return (
    <div className="flex items-center gap-0.5" aria-label={`Last ${recent.length} runs`}>
      {recent.map((s, i) => (
        <span
          key={i}
          className={`inline-block h-2 w-2 rounded-sm ${
            s === "passed" ? "bg-green-500" : s === "failed" ? "bg-destructive" : "bg-muted-foreground/40"
          }`}
          title={s}
        />
      ))}
    </div>
  );
}
