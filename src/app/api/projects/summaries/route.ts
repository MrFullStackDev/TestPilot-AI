import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { readSummariesCache, writeSummariesCache } from "@/server/util/summaries-cache";

export const runtime = "nodejs";

// 11 correlated subqueries × N projects gets expensive — the home page polls
// this on every render. A short in-process cache (see summaries-cache.ts)
// absorbs the burst without going stale enough to mislead the user.

// Rich list of projects with last-activity stats for the home page.
export async function GET() {
  const cached = readSummariesCache();
  if (cached) return NextResponse.json(cached);
  const rows = db().prepare(
    `SELECT
       p.id,
       p.slug,
       p.name,
       p.root_url,
       p.framework,
       p.created_at,
       (SELECT COUNT(*) FROM tests t WHERE t.project_id = p.id)                                            AS test_count,
       (SELECT COUNT(*) FROM tests t WHERE t.project_id = p.id AND t.flaky_flag = 1)                       AS flaky_count,
       (SELECT COUNT(*) FROM heal_events he JOIN tests t ON t.id = he.test_id WHERE t.project_id = p.id AND he.accepted = 0)
                                                                                                            AS pending_heals,
       (SELECT COALESCE(SUM(cost_usd),0) FROM llm_calls WHERE project_id = p.id)                            AS cost_usd,
       (SELECT MAX(captured_at) FROM pages pg WHERE pg.project_id = p.id)                                   AS last_capture_at,
       (SELECT MAX(started_at) FROM runs r WHERE r.project_id = p.id)                                       AS last_run_at,
       (SELECT status FROM runs r WHERE r.project_id = p.id ORDER BY r.id DESC LIMIT 1)                     AS last_run_status,
       (SELECT pass FROM (
          SELECT
            (SELECT COUNT(*) FROM test_results tr WHERE tr.run_id = r.id AND tr.status = 'passed') AS pass,
            (SELECT COUNT(*) FROM test_results tr WHERE tr.run_id = r.id) AS total
          FROM runs r WHERE r.project_id = p.id ORDER BY r.id DESC LIMIT 1
        ))                                                                                                  AS last_run_pass,
       (SELECT total FROM (
          SELECT
            (SELECT COUNT(*) FROM test_results tr WHERE tr.run_id = r.id AND tr.status = 'passed') AS pass,
            (SELECT COUNT(*) FROM test_results tr WHERE tr.run_id = r.id) AS total
          FROM runs r WHERE r.project_id = p.id ORDER BY r.id DESC LIMIT 1
        ))                                                                                                  AS last_run_total
     FROM projects p
     ORDER BY p.created_at DESC`
  ).all();
  writeSummariesCache(rows);
  return NextResponse.json(rows);
}
