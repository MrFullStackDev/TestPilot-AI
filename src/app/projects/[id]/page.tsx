import Link from "next/link";
import { notFound } from "next/navigation";
import { Play, Download, Activity, Wand2, FileSearch, ScrollText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CostTracker } from "@/components/CostTracker";
import { WorkflowStepper, type Step } from "@/components/WorkflowStepper";
import { ProjectActions } from "@/components/ProjectActions";
import { ProjectActivity } from "@/components/ProjectActivity";
import {
  DEMO_PROJECT_IDS,
  demoProjects,
  demoPages,
  demoTests,
  demoHeals,
  demoRuns,
  demoLearn,
  demoAuth,
} from "@/lib/demo-data";

export function generateStaticParams() {
  return DEMO_PROJECT_IDS.map((id) => ({ id: String(id) }));
}

export default function ProjectPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const project = demoProjects.find((p) => p.id === id);
  if (!project) notFound();

  const pages = (demoPages[id as 1 | 2] ?? []) as ReadonlyArray<{ captured: number }>;
  const tests = (demoTests[id as 1 | 2] ?? []) as ReadonlyArray<{ flaky_flag: number }>;
  const heals = (demoHeals[id as 1 | 2] ?? []) as ReadonlyArray<{ accepted: number }>;
  const runs  = (demoRuns[id as 1 | 2] ?? []) as ReadonlyArray<{ id: number; status: string; started_at: string }>;
  const pageCount    = pages.length;
  const captureCount = pages.filter((p) => p.captured === 1).length;
  const testCount    = tests.length;
  const flakyCount   = tests.filter((t) => t.flaky_flag === 1).length;
  const pendingHeals = heals.filter((h) => h.accepted === 0).length;
  const hasProfile   = !!demoLearn[id as 1 | 2]?.profile;
  const hasAuth      = !!demoAuth[id as 1 | 2]?.recorded;
  const lastRun      = runs[0];

  const steps: Step[] = [
    { key: "discover", label: "Discover",  href: `/projects/${id}/crawl`,    done: pageCount > 0,    current: pageCount === 0,                    meta: pageCount > 0 ? `${pageCount} URLs` : undefined },
    { key: "capture",  label: "Capture",   href: `/projects/${id}/crawl`,    done: captureCount > 0, current: pageCount > 0 && captureCount === 0,  meta: captureCount > 0 ? `${captureCount} pages` : undefined },
    { key: "auth",     label: "Auth",      href: `/projects/${id}/auth`,     done: hasAuth,          meta: hasAuth ? "recorded" : "optional" },
    { key: "profile",  label: "Profile",   href: `/projects/${id}/learn`,    done: hasProfile,       meta: hasProfile ? "built" : "optional" },
    { key: "generate", label: "Generate",  href: `/projects/${id}/generate`, done: testCount > 0,    current: captureCount > 0 && testCount === 0, meta: testCount > 0 ? `${testCount} tests` : undefined },
    { key: "run",      label: "Run",       href: `/projects/${id}/runs`,     done: !!lastRun,        current: testCount > 0 && !lastRun,            meta: lastRun ? lastRun.status : undefined },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Breadcrumb items={[{ label: "Projects", href: "/" }, { label: project.name }]} />
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            {project.framework && <Badge variant="outline" className="capitalize">{project.framework}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            <a href={project.root_url} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">{project.root_url}</a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/projects/${id}/runs`}><Play className="mr-1 h-4 w-4" />Run all</Link>
          </Button>
          <Button variant="outline" disabled title="Disabled in static demo build">
            <Download className="mr-1 h-4 w-4" />Export
          </Button>
          <ProjectActions projectId={id} projectName={project.name} />
        </div>
      </div>

      <WorkflowStepper steps={steps} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <KpiTile icon={<FileSearch className="h-4 w-4" />} title="Captures"        value={captureCount} subtitle={`${pageCount} discovered`} href={`/projects/${id}/crawl`} cta="Open" />
        <KpiTile icon={<Wand2 className="h-4 w-4" />}      title="Tests generated" value={testCount}      subtitle={testCount > 0 ? "Re-run generate any time" : "Run generate after capturing"} href={`/projects/${id}/generate`} cta="Generate" />
        <KpiTile icon={<Activity className="h-4 w-4" />}    title="Last run"
          value={lastRun ? lastRun.status : "—"}
          subtitle={lastRun ? `#${lastRun.id}` : "Run all to start"}
          href={`/projects/${id}/runs`}
          cta="History"
          tone={lastRun ? (lastRun.status === "passed" ? "good" : "bad") : undefined}
        />
        <KpiTile icon={<ScrollText className="h-4 w-4" />} title="Flaky tests"     value={flakyCount}     subtitle={flakyCount > 0 ? "Review & quarantine" : "All stable"} href={`/projects/${id}/generate`} cta="Inspect" tone={flakyCount > 0 ? "warn" : undefined} />
        <KpiTile
          icon={<Wand2 className="h-4 w-4" />}
          title="Heal proposals"
          value={pendingHeals}
          subtitle={pendingHeals > 0 ? "Awaiting review" : "Nothing pending"}
          href={`/projects/${id}/heals`}
          cta="Review"
          tone={pendingHeals > 0 ? "warn" : undefined}
        />
        <KpiTile icon={<Lock className="h-4 w-4" />}        title="Auth"           value={hasAuth ? "Recorded" : "None"} subtitle={hasAuth ? "Reused for crawls + tests" : "Skip if no login"} href={`/projects/${id}/auth`} cta={hasAuth ? "Re-record" : "Record"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <ProjectActivity projectId={id} />
        <CostTracker projectId={id} />
      </div>
    </div>
  );
}

function KpiTile({ icon, title, value, subtitle, href, cta, tone }: {
  icon: React.ReactNode;
  title: string;
  value: React.ReactNode;
  subtitle: React.ReactNode;
  href: string;
  cta: string;
  tone?: "good" | "bad" | "warn";
}) {
  const toneCls = tone === "good" ? "border-green-300/60" :
                  tone === "bad" ? "border-destructive/40" :
                  tone === "warn" ? "border-yellow-300/60" : "";
  return (
    <Card className={`overflow-hidden ${toneCls}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5">{icon}{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3 pb-4">
        <div>
          <div className={`text-2xl font-semibold ${tone === "warn" ? "text-yellow-700 dark:text-yellow-400" : tone === "bad" ? "text-destructive" : tone === "good" ? "text-green-600 dark:text-green-400" : ""}`}>
            {value}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={href}>{cta} →</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
