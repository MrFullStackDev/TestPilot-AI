"use client";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2, Sparkles, Brush } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";
import { apiFetch } from "@/lib/api";

export function ProjectActions({ projectId, projectName }: { projectId: number; projectName: string }) {
  const router = useRouter();
  const { push } = useToast();
  const confirm = useConfirm();

  async function rename() {
    const next = window.prompt("New name", projectName);
    if (!next || next === projectName) return;
    const r = await apiFetch(`/api/projects/${projectId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    if (r.ok) { push({ title: "Renamed", variant: "success" }); router.refresh(); }
    else      { push({ title: "Rename failed", variant: "destructive" }); }
  }

  async function cleanup() {
    const ok = await confirm({
      title: "Run cleanup?",
      description: "Caps run history at 50, captures per page at 5, and prunes LLM logs older than 30 days. Generated tests are kept.",
      confirmLabel: "Run cleanup",
    });
    if (!ok) return;
    const r = await apiFetch(`/api/projects/${projectId}/cleanup`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
    });
    const j = await r.json();
    if (r.ok) { push({ title: "Cleaned up", description: `Removed ${j.removedFiles} files`, variant: "success" }); router.refresh(); }
    else      { push({ title: "Cleanup failed", description: j.error, variant: "destructive" }); }
  }

  async function regenerateProfile() {
    push({ title: "Rebuilding profile…" });
    const r = await apiFetch(`/api/projects/${projectId}/learn`, { method: "POST" });
    if (r.ok) { push({ title: "Profile rebuilt", variant: "success" }); router.refresh(); }
    else      { push({ title: "Profile build failed", description: (await r.json()).error, variant: "destructive" }); }
  }

  async function destroy() {
    const ok = await confirm({
      title: `Delete "${projectName}"?`,
      description: "Removes the project, captures, runs, and tests metadata. The on-disk generated Playwright project under data/projects/ stays intact.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const r = await apiFetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (r.ok) { push({ title: "Project deleted", variant: "success" }); router.push("/"); }
    else      { push({ title: "Delete failed", variant: "destructive" }); }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Project menu"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={rename}><Pencil className="mr-2 h-4 w-4" />Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={regenerateProfile}><Sparkles className="mr-2 h-4 w-4" />Rebuild site profile</DropdownMenuItem>
        <DropdownMenuItem onSelect={cleanup}><Brush className="mr-2 h-4 w-4" />Run cleanup…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={destroy}><Trash2 className="mr-2 h-4 w-4" />Delete project…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
