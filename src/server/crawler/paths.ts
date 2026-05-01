import path from "node:path";
import { slugify } from "@/lib/utils";

export function snapshotDir(projectSlug: string, pageUrl: string): string {
  const u = new URL(pageUrl);
  const pageSlug = slugify(u.pathname + (u.search || "")) || "root";
  return path.resolve(process.cwd(), "data", "snapshots", projectSlug, pageSlug);
}

export function projectOutDir(projectSlug: string): string {
  return path.resolve(process.cwd(), "data", "projects", projectSlug);
}

export function authStatePath(projectSlug: string): string {
  return path.resolve(process.cwd(), "data", "snapshots", projectSlug, ".auth", "state.json");
}
