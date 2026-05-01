"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toaster";
import { Breadcrumb } from "@/components/Breadcrumb";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rootUrl, setRootUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const urlOk = (() => { try { new URL(rootUrl); return true; } catch { return false; } })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, rootUrl }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "failed");
      push({ title: "Project created", variant: "success" });
      router.push(`/projects/${j.id}/crawl`);
    } catch (e: any) {
      push({ title: "Could not create", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Breadcrumb items={[{ label: "Projects", href: "/" }, { label: "New" }]} />
      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
          <CardDescription>Point at a site's root URL. We'll discover pages next, then you pick what to capture.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme staging" required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="root">Root URL</Label>
              <Input id="root" value={rootUrl} onChange={(e) => setRootUrl(e.target.value)} placeholder="https://example.com" type="url" required />
              {rootUrl && !urlOk && <p className="text-xs text-destructive">Looks malformed. Include the scheme (https://).</p>}
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={busy || !name || !urlOk}>{busy ? "Creating…" : "Create project"}</Button>
              <Button type="button" variant="outline" asChild><Link href="/">Cancel</Link></Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
