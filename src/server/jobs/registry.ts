// In-memory job registry. Long-running operations (crawl, generate, run)
// register themselves so the UI can list and cancel them. Cancellation:
// the consumer should check `signal.aborted` at safe points and react;
// for child processes we expose a `kill()` hook.

import { randomUUID } from "node:crypto";

export type JobKind = "crawl" | "generate" | "run" | "heal";
export type JobStatus = "running" | "done" | "failed" | "cancelled";

export type Job = {
  id: string;
  kind: JobKind;
  projectId: number;
  startedAt: number;
  status: JobStatus;
  signal: AbortSignal;
  cancel: (reason?: string) => void;
  killHooks: Array<() => void>;
};

const _jobs = new Map<string, Job>();

export function startJob(kind: JobKind, projectId: number): Job {
  const ac = new AbortController();
  const id = randomUUID();
  const job: Job = {
    id,
    kind,
    projectId,
    startedAt: Date.now(),
    status: "running",
    signal: ac.signal,
    cancel: (reason = "cancelled by user") => {
      if (job.status !== "running") return;
      try { ac.abort(reason); } catch {}
      for (const hook of job.killHooks) { try { hook(); } catch {} }
      job.status = "cancelled";
    },
    killHooks: [],
  };
  _jobs.set(id, job);
  return job;
}

export function finishJob(id: string, status: Exclude<JobStatus, "running"> = "done") {
  const j = _jobs.get(id);
  if (!j) return;
  if (j.status === "running") j.status = status;
  // keep around briefly so the UI can see the final status
  setTimeout(() => _jobs.delete(id), 30_000).unref?.();
}

export function getJob(id: string): Job | undefined { return _jobs.get(id); }

export function listJobs(projectId?: number): Array<Pick<Job, "id" | "kind" | "projectId" | "startedAt" | "status">> {
  return Array.from(_jobs.values())
    .filter((j) => projectId === undefined || j.projectId === projectId)
    .map(({ id, kind, projectId, startedAt, status }) => ({ id, kind, projectId, startedAt, status }));
}
