import { db } from "@/server/db/client";

// Computed per-test, written to tests.flaky_flag + flaky_reason.
// Triggers (any one):
//  - pass rate < 95% over last 20 runs (with at least 5 runs)
//  - heal frequency > 2 in 30 days
//  - duration variance > 50% of mean (with >= 5 samples)

export function recomputeFlakiness(projectId: number) {
  const tests = db().prepare("SELECT id FROM tests WHERE project_id = ?").all(projectId) as Array<{ id: number }>;
  for (const t of tests) {
    const reasons = flakyReasons(t.id);
    db().prepare("UPDATE tests SET flaky_flag = ?, flaky_reason = ? WHERE id = ?")
      .run(reasons.length > 0 ? 1 : 0, reasons.join("; ") || null, t.id);
  }
}

function flakyReasons(testId: number): string[] {
  const reasons: string[] = [];
  const recent = db().prepare(
    "SELECT status, duration_ms FROM test_results WHERE test_id = ? ORDER BY id DESC LIMIT 20"
  ).all(testId) as Array<{ status: string; duration_ms: number | null }>;
  if (recent.length >= 5) {
    const passed = recent.filter((r) => r.status === "passed").length;
    const rate = passed / recent.length;
    if (rate < 0.95) reasons.push(`pass rate ${(rate * 100).toFixed(0)}% over last ${recent.length}`);

    const durs = recent.map((r) => r.duration_ms).filter((d): d is number => typeof d === "number" && d > 0);
    if (durs.length >= 5) {
      const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
      const variance = durs.reduce((a, b) => a + (b - mean) ** 2, 0) / durs.length;
      const std = Math.sqrt(variance);
      if (std / mean > 0.5) reasons.push(`duration σ/μ = ${(std / mean).toFixed(2)}`);
    }
  }

  const heals = db().prepare(
    "SELECT COUNT(*) as c FROM heal_events WHERE test_id = ? AND created_at > datetime('now', '-30 days')"
  ).get(testId) as { c: number };
  if (heals.c > 2) reasons.push(`${heals.c} heals in 30 days`);

  return reasons;
}
