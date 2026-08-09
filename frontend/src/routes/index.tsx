import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Radar, RefreshCw, ScanLine } from "lucide-react";

import {
  fetchComparison,
  fetchProjects,
  guessPair,
  type ComparisonResult,
  type Severity,
} from "@/lib/parity-api";
import { EnvironmentCard } from "@/components/parity/EnvironmentCard";
import { PipelineHeader } from "@/components/parity/PipelineHeader";
import { ScanningView, SCAN_STEPS, useScanProgress } from "@/components/parity/ScanningView";
import { FindingCard } from "@/components/parity/FindingCard";
import { SummaryPanel } from "@/components/parity/SummaryPanel";

const TITLE = "Parity Radar — Environment configuration drift detection";
const DESCRIPTION =
  "Compare a staging and a production Zerops environment and surface meaningful configuration drift instead of raw JSON diffs.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ParityRadar,
});

function ParityRadar() {
  const [stagingId, setStagingId] = useState<string>("");
  const [productionId, setProductionId] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Severity | "all">("all");

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
    retry: false,
  });

  const projects = projectsQuery.data ?? [];

  useEffect(() => {
    if (!projects.length || stagingId) return;
    const pair = guessPair(projects);
    setStagingId(pair.staging?.id ?? "");
    setProductionId(pair.production?.id ?? pair.staging?.id ?? "");
  }, [projects, stagingId]);

  const staging = projects.find((p) => p.id === stagingId);
  const production = projects.find((p) => p.id === productionId);
  const scanStep = useScanProgress(scanning);

  async function runComparison() {
    if (!stagingId || !productionId) return;
    setScanning(true);
    setResult(null);
    setCompareError(null);
    setFilter("all");
    try {
      const comparison = await fetchComparison(stagingId, productionId);
      setResult(comparison);
    } catch (error) {
      setCompareError(error instanceof Error ? error.message : "Comparison failed.");
    } finally {
      setScanning(false);
    }
  }

  const visibleFindings = useMemo(() => {
    if (!result) return [];

    const severityPriority: Record<Severity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };

    const orderedFindings = [...result.findings].sort((a, b) => {
      const priorityDelta = severityPriority[a.severity] - severityPriority[b.severity];
      return priorityDelta !== 0 ? priorityDelta : 0;
    });

    if (filter === "all") return orderedFindings;
    return orderedFindings.filter((finding) => finding.severity === filter);
  }, [result, filter]);

  const sameProject = Boolean(stagingId) && stagingId === productionId;
  const canCompare = Boolean(stagingId && productionId) && !sameProject && !scanning;

  return (
    <div className="field-backdrop min-h-screen">
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-border bg-elevated">
              <Radar className="size-5 text-primary" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Parity Radar</h1>
              <p className="text-sm text-muted-foreground">
                Semantic configuration drift between environments
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => projectsQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
          >
            <RefreshCw
              className={`size-3.5 ${projectsQuery.isFetching ? "animate-spin" : ""}`}
              aria-hidden
            />
            Reload projects
          </button>
        </header>

        <main className="mt-8 flex flex-col gap-6">
          {projectsQuery.isLoading && <LoadingProjects />}

          {projectsQuery.isError && (
            <ErrorState
              title="Could not load projects"
              message={
                projectsQuery.error instanceof Error
                  ? projectsQuery.error.message
                  : "The API is unavailable."
              }
              onRetry={() => projectsQuery.refetch()}
            />
          )}

          {projectsQuery.isSuccess && projects.length === 0 && <NoProjects />}

          {projects.length > 0 && (
            <>
              <PipelineHeader activeIndex={scanning ? Math.min(scanStep, 3) : result ? 3 : -1} />

              <section className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                <EnvironmentCard
                  role="staging"
                  project={staging}
                  projects={projects}
                  onChange={setStagingId}
                />
                <div className="flex items-center justify-center lg:flex-col">
                  <span className="eyebrow rotate-0 lg:rotate-0">compare</span>
                </div>
                <EnvironmentCard
                  role="production"
                  project={production}
                  projects={projects}
                  onChange={setProductionId}
                />
              </section>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={runComparison}
                  disabled={!canCompare}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {scanning ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <ScanLine className="size-4" aria-hidden />
                  )}
                  {scanning ? "Scanning environments…" : "Compare Environments"}
                </button>
                <p className="text-xs text-muted-foreground">
                  {sameProject
                    ? "Select two different projects to compare."
                    : "Ready to compare — configuration is read live from the API."}
                </p>
              </div>

              {scanning && <ScanningView step={scanStep} />}

              {compareError && !scanning && (
                <ErrorState
                  title="Comparison failed"
                  message={compareError}
                  onRetry={runComparison}
                />
              )}

              {result && !scanning && result.findings.length === 0 && (
                <NoDrift rawChangeCount={result.rawChangeCount} />
              )}

              {result && !scanning && result.findings.length > 0 && (
                <>
                  <SummaryPanel
                    findings={result.findings}
                    summary={result.summary}
                    rawChangeCount={result.rawChangeCount}
                    activeFilter={filter}
                    onFilter={setFilter}
                  />
                  <section aria-label="Findings" className="flex flex-col gap-4">
                    {visibleFindings.map((finding, index) => (
                      <FindingCard key={finding.id} finding={finding} index={index} />
                    ))}
                    {visibleFindings.length === 0 && (
                      <p className="panel p-6 text-sm text-muted-foreground">
                        No findings at this severity.
                      </p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </main>

        <footer className="mt-12 border-t border-border pt-5 text-xs text-muted-foreground">
          Parity Radar reads configuration from the existing Zerops API. Findings are derived from
          semantic drift rules, not raw JSON diffing.
        </footer>
      </div>
    </div>
  );
}

function LoadingProjects() {
  return (
    <div className="panel p-6">
      <p className="eyebrow flex items-center gap-2">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Discovering environments
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="rounded-xl border border-border bg-elevated/40 p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-border-strong" />
            <div className="mt-3 h-9 w-full animate-pulse rounded bg-border" />
            <div className="mt-3 h-14 w-full animate-pulse rounded bg-border/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

function NoProjects() {
  return (
    <div className="panel p-8 text-center">
      <Radar className="mx-auto size-6 text-muted-foreground" aria-hidden />
      <h2 className="mt-3 text-lg font-semibold tracking-tight">No environments available</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        The API returned an empty project list. Once at least two Zerops projects are visible,
        Parity Radar can compare them.
      </p>
    </div>
  );
}

function NoDrift({ rawChangeCount }: { rawChangeCount: number }) {
  return (
    <div className="panel reveal p-8 text-center">
      <CheckCircle2 className="mx-auto size-7 text-production" aria-hidden />
      <h2 className="mt-3 text-2xl font-semibold tracking-tight">Environments are in parity</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        No meaningful configuration drift detected.
      </p>
      <p className="mt-3 font-mono text-xs text-muted-foreground">
        {rawChangeCount} raw configuration changes → 0 meaningful findings
      </p>
    </div>
  );
}

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="panel border-high/40 p-6" role="alert">
      <p className="eyebrow flex items-center gap-2 text-high">
        <AlertTriangle className="size-3.5" aria-hidden />
        API error
      </p>
      <h2 className="mt-2 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-xs font-medium transition-colors hover:bg-elevated"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        Try again
      </button>
    </div>
  );
}
