import { NextRequest, NextResponse } from "next/server";
import { listJobs } from "@/server/jobs/registry";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const projectIdParam = req.nextUrl.searchParams.get("projectId");
  const projectId = projectIdParam ? Number(projectIdParam) : undefined;
  return NextResponse.json(listJobs(projectId));
}
