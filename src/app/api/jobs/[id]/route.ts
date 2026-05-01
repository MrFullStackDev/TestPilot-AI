import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/server/jobs/registry";

export const runtime = "nodejs";

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const job = getJob(params.id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  job.cancel("cancelled via API");
  return NextResponse.json({ ok: true });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const job = getJob(params.id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id: job.id, kind: job.kind, status: job.status, projectId: job.projectId, startedAt: job.startedAt });
}
