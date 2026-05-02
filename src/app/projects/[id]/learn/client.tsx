"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Sparkles, Save, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumb } from "@/components/Breadcrumb";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

type Profile = {
  selectorStrategy?: string[];
  framework?: string;
  routingStyle?: "spa" | "mpa" | "hybrid";
  waitStrategy?: string;
  authPattern?: { type?: string; loginUrl?: string | null; successIndicator?: string | null };
  namingConvention?: string;
  assertionStyle?: string;
  knownFlows?: Array<{ name: string; description?: string }>;
};

const STRATEGY_OPTIONS = ["data-testid", "getByRole", "getByLabel", "text", "css", "xpath"];
const ROUTING = ["spa", "mpa", "hybrid"] as const;
const AUTH = ["form", "oauth", "magic-link", "sso", "none"] as const;

export default function LearnPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<{ name: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const confirm = useConfirm();

  useEffect(() => { void load(); }, []);

  async function load() {
    const [a, b] = await Promise.all([
      apiFetch(`/api/projects/${id}/learn`).then((r) => r.json()),
      apiFetch(`/api/projects/${id}`).then((r) => r.json()),
    ]);
    const p = (a.profile as Profile | null) ?? null;
    setProfile(p);
    setJson(JSON.stringify(p ?? {}, null, 2));
    setProject(b);
  }

  async function build() {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/projects/${id}/learn`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed");
      setProfile(j.profile);
      setJson(JSON.stringify(j.profile, null, 2));
      push({ title: "Profile built", variant: "success" });
    } catch (e: any) {
      push({ title: "Build failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function save() {
    let payload: unknown;
    if (advanced) {
      try { payload = JSON.parse(json); }
      catch { return push({ title: "Invalid JSON", variant: "destructive" }); }
    } else {
      payload = profile ?? {};
    }
    if (!payload || (typeof payload === "object" && Object.keys(payload as object).length === 0)) {
      const ok = await confirm({
        title: "Profile is empty",
        description: "Saving will replace any existing profile with an empty one. Continue?",
        confirmLabel: "Save anyway",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    const r = await apiFetch(`/api/projects/${id}/learn`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    setBusy(false);
    if (r.ok) push({ title: "Profile saved", variant: "success" });
    else      push({ title: "Save failed", variant: "destructive" });
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Projects", href: "/" }, { label: project?.name ?? "…", href: `/projects/${id}` }, { label: "Site profile" }]} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Site profile</h1>
          <p className="text-sm text-muted-foreground">Conventions reused on every generation: selector strategy, routing style, framework, known flows. Edit freely.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
            Advanced JSON
          </label>
          <Button variant="outline" onClick={build} disabled={busy}>
            <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {profile && Object.keys(profile).length > 0 ? "Rebuild" : "Build"}
          </Button>
          <Button onClick={save} disabled={busy}><Save className="mr-1 h-4 w-4" />Save</Button>
        </div>
      </div>

      {profile === null ? (
        <Skeleton className="h-64 w-full" />
      ) : !advanced && Object.keys(profile).length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title="No profile yet"
          description="Click Build to derive a profile from your captured pages, or switch to Advanced JSON to write one by hand."
        />
      ) : advanced ? (
        <Card>
          <CardHeader><CardTitle>profile.json</CardTitle><CardDescription>Free-form. Validated on save.</CardDescription></CardHeader>
          <CardContent>
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              spellCheck={false}
              className="h-[480px] w-full rounded-md border bg-muted/40 p-3 font-mono text-xs"
            />
          </CardContent>
        </Card>
      ) : (
        <ProfileForm profile={profile!} setProfile={setProfile} />
      )}
    </div>
  );
}

function ProfileForm({ profile, setProfile }: { profile: Profile; setProfile: (p: Profile) => void }) {
  function update<K extends keyof Profile>(k: K, v: Profile[K]) { setProfile({ ...profile, [k]: v }); }
  function toggleStrategy(s: string) {
    const cur = profile.selectorStrategy ?? [];
    update("selectorStrategy", cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Selector strategy</CardTitle><CardDescription>Order of preference, most stable first.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {STRATEGY_OPTIONS.map((s) => {
            const idx = (profile.selectorStrategy ?? []).indexOf(s);
            const active = idx >= 0;
            return (
              <label key={s} className="flex items-center gap-2 rounded border bg-background px-2 py-1.5 text-sm">
                <input type="checkbox" checked={active} onChange={() => toggleStrategy(s)} />
                <span className="flex-1 font-mono text-xs">{s}</span>
                {active && <span className="text-xs text-muted-foreground">#{idx + 1}</span>}
              </label>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Framework & routing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Framework</Label>
            <Input placeholder="react, vue, next, nuxt, svelte, html…" value={profile.framework ?? ""} onChange={(e) => update("framework", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Routing style</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={profile.routingStyle ?? "mpa"} onChange={(e) => update("routingStyle", e.target.value as Profile["routingStyle"])}>
              {ROUTING.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Wait strategy</Label>
            <Input placeholder="networkidle-then-element" value={profile.waitStrategy ?? ""} onChange={(e) => update("waitStrategy", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Naming convention</Label>
            <Input placeholder="kebab-case" value={profile.namingConvention ?? ""} onChange={(e) => update("namingConvention", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Auth pattern</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={profile.authPattern?.type ?? "none"}
              onChange={(e) => update("authPattern", { ...profile.authPattern, type: e.target.value })}
            >
              {AUTH.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Login URL</Label>
            <Input placeholder="/login" value={profile.authPattern?.loginUrl ?? ""} onChange={(e) => update("authPattern", { ...profile.authPattern, loginUrl: e.target.value || null })} />
          </div>
          <div className="space-y-1">
            <Label>Success indicator</Label>
            <Input placeholder="selector or url substring" value={profile.authPattern?.successIndicator ?? ""} onChange={(e) => update("authPattern", { ...profile.authPattern, successIndicator: e.target.value || null })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Known flows</CardTitle><CardDescription>Used to seed test plans.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {(profile.knownFlows ?? []).map((f, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <Input placeholder="name" value={f.name} onChange={(e) => {
                const arr = [...(profile.knownFlows ?? [])];
                arr[i] = { ...arr[i], name: e.target.value };
                update("knownFlows", arr);
              }} />
              <Input placeholder="description" value={f.description ?? ""} onChange={(e) => {
                const arr = [...(profile.knownFlows ?? [])];
                arr[i] = { ...arr[i], description: e.target.value };
                update("knownFlows", arr);
              }} />
              <Button variant="ghost" size="sm" onClick={() => update("knownFlows", (profile.knownFlows ?? []).filter((_, j) => j !== i))}>Remove</Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => update("knownFlows", [...(profile.knownFlows ?? []), { name: "" }])}>+ Add flow</Button>
        </CardContent>
      </Card>
    </div>
  );
}
