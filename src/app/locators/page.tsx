"use client";
import { useMemo, useState } from "react";
import { Copy, Download, FileCode, Sparkles, Wand2, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/api";
import { cn, formatBytes } from "@/lib/utils";
import { useToast } from "@/components/Toaster";

const FRAMEWORKS = [
  { value: "playwright-ts",   label: "Playwright (TypeScript)" },
  { value: "playwright-py",   label: "Playwright (Python)" },
  { value: "cypress",         label: "Cypress" },
  { value: "webdriverio",     label: "WebdriverIO" },
  { value: "selenium-java",   label: "Selenium (Java)" },
  { value: "selenium-python", label: "Selenium (Python)" },
] as const;

const SAMPLE_FORM = `<form action="/login" method="post">
  <h2>Sign in</h2>
  <label>Email <input data-testid="email" type="email" name="email" placeholder="you@company.com" required /></label>
  <label>Password <input data-testid="password" type="password" name="password" required /></label>
  <label><input type="checkbox" name="remember" /> Remember me</label>
  <button type="submit">Sign in</button>
  <a href="/forgot">Forgot password?</a>
</form>`;

const SAMPLE_PAGE = `<!doctype html>
<html><head><title>Login</title><script>console.log("hidden noise")</script></head>
<body>
  <h1>Sign in</h1>
  <form>
    <label>Email <input data-testid="email" type="email" placeholder="you@company.com" /></label>
    <label>Password <input data-testid="password" type="password" /></label>
    <button type="submit">Sign in</button>
  </form>
  <a href="/signup">No account? Sign up</a>
</body></html>`;

type Mode = "distill" | "page-object";

type DistillOut = { trimmed: string; bytes: { input: number; output: number } };
type LocatorsOut = {
  framework: string;
  filename: string;
  language: string;
  code: string;
  analysis: { pageName: string; elements: Array<{ alias: string; purpose: string; kind: string; locators: { strategy: string; value: string }[] }> };
  distilled: string;
  bytes: { input: number; distilled: number };
};

export default function DomToolsPage() {
  const [mode, setMode] = useState<Mode>("distill");
  const [html, setHtml] = useState("");
  const [framework, setFramework] = useState<typeof FRAMEWORKS[number]["value"]>("playwright-ts");
  const [pageNameHint, setPageNameHint] = useState("");
  const [distillOut, setDistillOut] = useState<DistillOut | null>(null);
  const [locatorsOut, setLocatorsOut] = useState<LocatorsOut | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setDistillOut(null);
    setLocatorsOut(null);
  }

  function loadSample() {
    if (mode === "distill") {
      setHtml(SAMPLE_PAGE);
    } else {
      setHtml(SAMPLE_FORM);
      setPageNameHint("LoginPage");
    }
  }

  async function run() {
    setBusy(true);
    setDistillOut(null);
    setLocatorsOut(null);
    try {
      if (mode === "distill") {
        const res = await apiFetch("/api/distill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ html }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "failed");
        setDistillOut(j);
      } else {
        const res = await apiFetch("/api/locators", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ html, framework, pageNameHint: pageNameHint || undefined }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "failed");
        setLocatorsOut(j);
      }
    } catch (e: any) {
      push({ title: mode === "distill" ? "Distill failed" : "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function copyDistill() {
    if (!distillOut) return;
    navigator.clipboard.writeText(distillOut.trimmed);
    push({ title: "Copied", variant: "success" });
  }

  function downloadDistill() {
    if (!distillOut) return;
    const blob = new Blob([distillOut.trimmed], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "distilled.html"; a.click();
    URL.revokeObjectURL(url);
  }

  function copyCode() {
    if (!locatorsOut) return;
    navigator.clipboard.writeText(locatorsOut.code);
    push({ title: "Copied to clipboard", variant: "success" });
  }

  function downloadCode() {
    if (!locatorsOut) return;
    const blob = new Blob([locatorsOut.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = locatorsOut.filename; a.click();
    URL.revokeObjectURL(url);
  }

  const grouped = useMemo(() => {
    if (!locatorsOut) return null;
    const map: Record<string, LocatorsOut["analysis"]["elements"]> = {};
    for (const el of locatorsOut.analysis.elements) (map[el.kind] ??= []).push(el);
    return map;
  }, [locatorsOut]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">DOM Tools</h1>
        <p className="text-sm text-muted-foreground">
          Paste raw HTML. Distill it down to a clean skeleton, or go further and generate a Page Object with ranked locators in your framework.
        </p>
      </div>

      <div role="tablist" aria-label="Mode" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ModeButton
          active={mode === "distill"}
          onClick={() => switchMode("distill")}
          icon={<Zap className="h-4 w-4" />}
          title="Distill"
          subtitle="Free · instant · no LLM"
        />
        <ModeButton
          active={mode === "page-object"}
          onClick={() => switchMode("page-object")}
          icon={<Wand2 className="h-4 w-4" />}
          title="Generate Page Object"
          subtitle="Uses LLM · framework code out"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Input</CardTitle>
              <CardDescription>{mode === "distill" ? "Up to 10 MB." : "Paste a form, page, or fragment."}</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={loadSample}>
              <Sparkles className="mr-1 h-3 w-3" />Try a sample
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder="<html>…</html>"
            spellCheck={false}
            className="h-64 w-full rounded-md border bg-muted/40 p-3 font-mono text-xs"
          />
          {mode === "page-object" && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Framework</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={framework} onChange={(e) => setFramework(e.target.value as typeof FRAMEWORKS[number]["value"])}>
                  {FRAMEWORKS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Page name <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input placeholder="LoginPage" value={pageNameHint} onChange={(e) => setPageNameHint(e.target.value)} />
              </div>
            </div>
          )}
          <Button onClick={run} disabled={busy || !html.trim()}>
            {mode === "distill" ? <FileCode className="mr-1 h-4 w-4" /> : <Wand2 className="mr-1 h-4 w-4" />}
            {busy ? (mode === "distill" ? "Distilling…" : "Generating…") : (mode === "distill" ? "Distill" : "Generate Page Object")}
          </Button>
        </CardContent>
      </Card>

      {busy && (
        mode === "distill"
          ? <Skeleton className="h-64 w-full" />
          : <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72 w-full" /><Skeleton className="h-72 w-full" /></div>
      )}

      {!busy && !distillOut && !locatorsOut && (
        mode === "distill"
          ? <EmptyState icon={<FileCode className="h-6 w-6" />} title="No output yet" description="Paste HTML and click Distill — or click Try a sample to load an example." />
          : <EmptyState icon={<Wand2 className="h-6 w-6" />} title="No output yet" description="Paste HTML, pick your framework, click Generate." />
      )}

      {distillOut && mode === "distill" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Distilled output</CardTitle>
                <CardDescription>{formatBytes(distillOut.bytes.input)} → {formatBytes(distillOut.bytes.output)} ({Math.round((1 - distillOut.bytes.output / distillOut.bytes.input) * 100)}% smaller)</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyDistill}><Copy className="mr-1 h-3 w-3" />Copy</Button>
                <Button size="sm" variant="outline" onClick={downloadDistill}><Download className="mr-1 h-3 w-3" />Download</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[28rem] overflow-auto rounded bg-muted p-3 text-xs">
              <code dangerouslySetInnerHTML={{ __html: highlight(distillOut.trimmed) }} />
            </pre>
          </CardContent>
        </Card>
      )}

      {locatorsOut && mode === "page-object" && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="font-mono text-base">{locatorsOut.filename}</CardTitle>
                  <CardDescription>{locatorsOut.framework} · {locatorsOut.analysis.elements.length} elements · {locatorsOut.language}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={copyCode}><Copy className="mr-1 h-3 w-3" />Copy</Button>
                  <Button size="sm" variant="outline" onClick={downloadCode}><Download className="mr-1 h-3 w-3" />Download</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[32rem] overflow-auto rounded bg-muted p-3 text-xs">{locatorsOut.code}</pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Element analysis</CardTitle>
              <CardDescription>{locatorsOut.analysis.pageName}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {grouped && Object.entries(grouped).map(([kind, els]) => (
                <div key={kind}>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{kind}</div>
                  <ul className="divide-y rounded border">
                    {els.map((e) => (
                      <li key={e.alias} className="grid grid-cols-1 items-center gap-1 px-3 py-2 text-sm sm:grid-cols-[10rem_1fr_auto]">
                        <code className="text-xs">{e.alias}</code>
                        <span className="text-muted-foreground">{e.purpose}</span>
                        <Badge variant="outline" className="justify-self-start font-mono text-[10px] sm:justify-self-end">{e.locators[0]?.strategy}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>

          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">Distilled DOM ({formatBytes(locatorsOut.bytes.input)} → {formatBytes(locatorsOut.bytes.distilled)})</summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{locatorsOut.distilled}</pre>
          </details>
        </>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, icon, title, subtitle }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
      )}
    >
      <span className={cn("grid h-8 w-8 place-items-center rounded-md", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

function highlight(html: string): string {
  const escaped = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/(&lt;\/?)([a-zA-Z][\w-]*)/g, '$1<span class="text-blue-700 dark:text-blue-400">$2</span>')
    .replace(/([a-zA-Z-]+)(=&quot;[^&]*&quot;)/g, '<span class="text-purple-700 dark:text-purple-400">$1</span>$2');
}
