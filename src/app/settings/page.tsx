"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff, ExternalLink, KeyRound, Plug, Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, readByok, writeByok, clearByok, type ByokStore } from "@/lib/api";
import { useToast } from "@/components/Toaster";
import { useConfirm } from "@/components/ConfirmDialog";

type Settings = {
  default_provider: "anthropic" | "openai" | "google";
  default_model: string;
  cheap_model: string;
  budget_usd: number;
};

type ProviderKey = "anthropic" | "openai" | "google";

const PROVIDER_INFO: Record<ProviderKey, { label: string; placeholder: string; getKeyUrl: string; defaultModels: string[]; cheapModels: string[] }> = {
  anthropic: {
    label: "Anthropic",
    placeholder: "sk-ant-…",
    getKeyUrl: "https://console.anthropic.com/settings/keys",
    defaultModels: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001"],
    cheapModels: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"],
  },
  openai: {
    label: "OpenAI",
    placeholder: "sk-…",
    getKeyUrl: "https://platform.openai.com/api-keys",
    defaultModels: ["gpt-4o", "gpt-4o-mini"],
    cheapModels: ["gpt-4o-mini", "gpt-4o"],
  },
  google: {
    label: "Google (Gemini)",
    placeholder: "AIza…",
    getKeyUrl: "https://aistudio.google.com/app/apikey",
    defaultModels: ["gemini-1.5-pro", "gemini-2.0-flash"],
    cheapModels: ["gemini-2.0-flash", "gemini-1.5-pro"],
  },
};

type PingState = { state: "idle" | "ok" | "fail"; model?: string; error?: string; at?: number };

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [byok, setByok] = useState<ByokStore>({ keys: {}, integrations: {} });
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [pings, setPings] = useState<Record<ProviderKey, PingState>>({ anthropic: { state: "idle" }, openai: { state: "idle" }, google: { state: "idle" } });
  const [busy, setBusy] = useState(false);
  const [pinging, setPinging] = useState<ProviderKey | null>(null);
  const { push } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    (async () => {
      const j = await apiFetch("/api/settings").then((r) => r.json());
      setS(j);
      setByok(readByok());
    })();
  }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    try {
      writeByok(byok);
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          default_provider: s.default_provider,
          default_model: s.default_model,
          cheap_model: s.cheap_model,
          budget_usd: s.budget_usd,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "failed");
      setS(await res.json());
      push({ title: "Saved", variant: "success" });
    } catch (e: any) {
      push({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function clearLocal() {
    const ok = await confirm({
      title: "Clear all local keys & tokens?",
      description: "Provider keys and Jira/Linear tokens will be removed from this browser. Server-side defaults stay.",
      confirmLabel: "Clear",
      destructive: true,
    });
    if (!ok) return;
    clearByok();
    setByok({ keys: {}, integrations: {} });
    push({ title: "Cleared", variant: "success" });
  }

  async function ping(provider: ProviderKey) {
    if (!byok.keys[provider]) return push({ title: "No key", description: "Paste a key first." });
    setPinging(provider);
    writeByok(byok); // commit before request so the header carries the latest value
    const res = await apiFetch(`/api/settings/ping?provider=${provider}`, { method: "POST" });
    const j = await res.json();
    setPinging(null);
    setPings((p) => ({
      ...p,
      [provider]: j.ok ? { state: "ok", model: j.model, at: Date.now() } : { state: "fail", error: j.error, at: Date.now() },
    }));
  }

  if (!s) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> API keys
            <Badge variant="secondary" className="ml-2">browser-only</Badge>
          </CardTitle>
          <CardDescription>
            Stored in <code className="text-xs">localStorage</code> on this device only and sent as request headers. Nothing is written to the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {(Object.keys(PROVIDER_INFO) as ProviderKey[]).map((k) => {
            const info = PROVIDER_INFO[k];
            const pingState = pings[k];
            return (
              <div key={k} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`b-${k}`} className="flex items-center gap-2">
                    {info.label}
                    {byok.keys[k] && <span className="text-xs text-green-700 dark:text-green-400">set</span>}
                  </Label>
                  <a href={info.getKeyUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                    Get a key <ExternalLink className="-mt-0.5 inline h-3 w-3" />
                  </a>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id={`b-${k}`}
                      type={show[k] ? "text" : "password"}
                      placeholder={info.placeholder}
                      value={byok.keys[k] ?? ""}
                      onChange={(e) => setByok({ ...byok, keys: { ...byok.keys, [k]: e.target.value } })}
                    />
                    <button
                      type="button"
                      aria-label={show[k] ? "Hide key" : "Show key"}
                      onClick={() => setShow((p) => ({ ...p, [k]: !p[k] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {show[k] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button variant="outline" type="button" onClick={() => ping(k)} disabled={!byok.keys[k] || pinging === k}>
                    {pinging === k && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    {pinging === k ? "Pinging…" : "Ping"}
                  </Button>
                </div>
                {pingState.state === "ok" && (
                  <p className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3" /> {pingState.model}
                  </p>
                )}
                {pingState.state === "fail" && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <XCircle className="h-3 w-3" /> {pingState.error}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" /> Integrations</CardTitle>
          <CardDescription>Jira and Linear tokens — also browser-only, sent as request headers.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Jira base URL</Label>
            <Input placeholder="https://yoursite.atlassian.net" value={byok.integrations.jiraBaseUrl ?? ""} onChange={(e) => setByok({ ...byok, integrations: { ...byok.integrations, jiraBaseUrl: e.target.value } })} />
          </div>
          <div className="space-y-2">
            <Label>Jira email</Label>
            <Input type="email" placeholder="you@company.com" value={byok.integrations.jiraEmail ?? ""} onChange={(e) => setByok({ ...byok, integrations: { ...byok.integrations, jiraEmail: e.target.value } })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="flex items-center justify-between">
              <span>Jira API token</span>
              <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground hover:underline">Create one <ExternalLink className="-mt-0.5 inline h-3 w-3" /></a>
            </Label>
            <Input type={show.jira ? "text" : "password"} placeholder="ATATT…" value={byok.integrations.jiraToken ?? ""} onChange={(e) => setByok({ ...byok, integrations: { ...byok.integrations, jiraToken: e.target.value } })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="flex items-center justify-between">
              <span>Linear API key</span>
              <a href="https://linear.app/settings/api" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground hover:underline">Create one <ExternalLink className="-mt-0.5 inline h-3 w-3" /></a>
            </Label>
            <Input type={show.linear ? "text" : "password"} placeholder="lin_api_…" value={byok.integrations.linearToken ?? ""} onChange={(e) => setByok({ ...byok, integrations: { ...byok.integrations, linearToken: e.target.value } })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Defaults</CardTitle><CardDescription>Provider, model, and budget. These save server-side.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Provider</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={s.default_provider} onChange={(e) => setS({ ...s, default_provider: e.target.value as Settings["default_provider"] })}>
              {(Object.keys(PROVIDER_INFO) as ProviderKey[]).map((k) => <option key={k} value={k}>{PROVIDER_INFO[k].label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Default model</Label>
            <ModelInput value={s.default_model} onChange={(v) => setS({ ...s, default_model: v })} options={PROVIDER_INFO[s.default_provider].defaultModels} />
          </div>
          <div className="space-y-2">
            <Label>Cheap model <span className="text-xs text-muted-foreground">(used for analyse + heal)</span></Label>
            <ModelInput value={s.cheap_model} onChange={(v) => setS({ ...s, cheap_model: v })} options={PROVIDER_INFO[s.default_provider].cheapModels} />
          </div>
          <div className="space-y-2">
            <Label>Budget</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input className="pl-7" type="number" step="1" value={s.budget_usd} onChange={(e) => setS({ ...s, budget_usd: Number(e.target.value) })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        <Button variant="destructive" onClick={clearLocal}><Trash2 className="mr-1 h-4 w-4" />Clear local keys</Button>
      </div>
    </div>
  );
}

function ModelInput({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const isCustom = value && !options.includes(value);
  const [custom, setCustom] = useState(isCustom);
  return (
    <div className="flex gap-2">
      {custom ? (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="custom model id" />
      ) : (
        <select className="h-10 flex-1 rounded-md border bg-background px-3 text-sm" value={value} onChange={(e) => {
          if (e.target.value === "__custom__") setCustom(true);
          else onChange(e.target.value);
        }}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
          {!options.includes(value) && <option value={value}>{value}</option>}
          <option value="__custom__">Custom…</option>
        </select>
      )}
      {custom && <Button size="sm" variant="ghost" onClick={() => { setCustom(false); onChange(options[0]); }}>Reset</Button>}
    </div>
  );
}
