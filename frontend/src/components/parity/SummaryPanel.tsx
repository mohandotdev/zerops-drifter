import type { ComparisonSummary, Finding, Severity } from "@/lib/parity-api";

const ORDER: Array<{ key: Severity; label: string; hint: string }> = [
  { key: "high", label: "High", hint: "Blocks safe promotion" },
  { key: "medium", label: "Medium", hint: "Review before release" },
  { key: "low", label: "Low", hint: "Minor divergence" },
  { key: "info", label: "Info / Expected", hint: "Intentional difference" },
];

const TONE: Record<Severity, string> = {
  high: "text-high",
  medium: "text-medium",
  low: "text-low",
  info: "text-info",
};

export function SummaryPanel({
  findings,
  summary,
  rawChangeCount,
  activeFilter,
  onFilter,
}: {
  findings: Finding[];
  summary: ComparisonSummary;
  rawChangeCount: number;
  activeFilter: Severity | "all";
  onFilter: (value: Severity | "all") => void;
}) {
  const meaningful = Math.max(summary.total - summary.info, 0);

  return (
    <section className="panel p-6" aria-label="Comparison summary">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Semantic result</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            {meaningful} meaningful finding{meaningful === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {summary.total} findings returned by the API · {summary.info} expected / informational
          </p>
        </div>
        <button
          type="button"
          onClick={() => onFilter("all")}
          className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            activeFilter === "all"
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          All findings ({findings.length})
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ORDER.map(({ key, label, hint }) => {
          const count = summary[key];
          const active = activeFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onFilter(active ? "all" : key)}
              aria-pressed={active}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                active
                  ? "border-border-strong bg-elevated"
                  : "border-border bg-elevated/40 hover:border-border-strong"
              } ${count === 0 ? "opacity-55" : ""}`}
            >
              <p className="eyebrow">{label}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${TONE[key]}`}>{count}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
