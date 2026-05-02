"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Lock, ShieldCheck, ExternalLink, RotateCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Breadcrumb } from "@/components/Breadcrumb";
import { apiFetch } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import { useToast } from "@/components/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

export default function AuthPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<{ name: string; root_url: string } | null>(null);
  const [loginUrl, setLoginUrl] = useState("");
  const [info, setInfo] = useState<{ recorded_at: string | null; cookies: number; origins?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [openInstructions, setOpenInstructions] = useState(false);
  const { push } = useToast();
  const confirm = useConfirm();

  useEffect(() => { void load(); }, []);

  async function load() {
    const [a, b] = await Promise.all([
      apiFetch(`/api/projects/${id}/auth/info`).then((r) => r.json()),
      apiFetch(`/api/projects/${id}`).then((r) => r.json()),
    ]);
    setInfo(a); setProject(b);
  }

  async function startRecord() {
    setOpenInstructions(false);
    setBusy(true);
    push({ title: "Headed browser opening…", description: "Sign in, then close the window." });
    try {
      const res = await apiFetch(`/api/projects/${id}/auth/record`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ loginUrl }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "failed");
      push({
        title: "Auth saved",
        description: `${j.cookies} cookies, ${j.origins} origins.${j.warnings?.length ? ` Dropped ${j.warnings.length} foreign-domain entries.` : ""}`,
        variant: "success",
      });
      await load();
    } catch (e: any) {
      push({ title: "Recording failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function handleClick() {
    if (info?.recorded_at) {
      const ok = await confirm({
        title: "Re-record session?",
        description: "Replaces the existing storageState. Your previous session is overwritten.",
        confirmLabel: "Re-record",
      });
      if (!ok) return;
    }
    setOpenInstructions(true);
  }

  const host = (() => { try { return new URL(project?.root_url ?? "").hostname; } catch { return ""; } })();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Breadcrumb items={[{ label: "Projects", href: "/" }, { label: project?.name ?? "…", href: `/projects/${id}` }, { label: "Auth" }]} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auth recording</h1>
        <p className="text-sm text-muted-foreground">One-time login. We capture the session via Playwright's <code className="text-xs">storageState</code> and re-use it on every crawl + run.</p>
      </div>

      {info?.recorded_at && (
        <Card className="border-green-300/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              Session recorded
            </CardTitle>
            <CardDescription>{formatRelative(info.recorded_at)} · {info.cookies} cookies · {info.origins ?? 0} origins</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{info?.recorded_at ? "Re-record" : "Record session"}</CardTitle>
          <CardDescription>Opens a real Chromium window. We only keep cookies for {host && <Badge variant="outline">{host}</Badge>} and same-site subdomains; foreign-domain cookies (e.g. OAuth providers) are dropped automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loginUrl">Login URL (optional)</Label>
            <Input id="loginUrl" type="url" placeholder={`https://${host || "app.example.com"}/login`} value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} />
            <p className="text-xs text-muted-foreground">Leave blank to start at the project's root URL.</p>
          </div>
          <Button onClick={handleClick} disabled={busy}>
            {info?.recorded_at ? <RotateCw className="mr-1 h-4 w-4" /> : <Lock className="mr-1 h-4 w-4" />}
            {busy ? "Waiting for browser to close…" : info?.recorded_at ? "Re-record" : "Start recording"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={openInstructions} onOpenChange={setOpenInstructions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Before we open the browser</DialogTitle>
            <DialogDescription>A real Chromium window will open. To finish:</DialogDescription>
          </DialogHeader>
          <ol className="space-y-2 pl-5 text-sm list-decimal">
            <li>Sign in normally — passwords, MFA, SSO redirects all work.</li>
            <li>Don't browse to other sites; we drop cookies for any domain outside <code className="text-xs">{host}</code>.</li>
            <li>When you see a logged-in page, <strong>close the browser window</strong>. We capture the session at that moment.</li>
          </ol>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenInstructions(false)}>Cancel</Button>
            <Button onClick={startRecord}>
              <ExternalLink className="mr-1 h-4 w-4" />Open browser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
