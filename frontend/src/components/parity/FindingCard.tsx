import { useState } from "react";
import { ChevronRight, ArrowRight } from "lucide-react";
import type { Finding, Severity } from "@/lib/parity-api";

const SEVERITY_LABEL: Record<Severity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

function badgeLabel(finding: Finding) {
  if (finding.classification === "EXPECTED") return "Expected";
  if (finding.classification === "UNCLASSIFIED") return "Unclassified";
  return SEVERITY_LABEL[finding.severity];
}

const TONE: Record<Severity, { text: string; bg: string; border: string; dot: string }> = {
  high: { text: "text-high", bg: "bg-high/10", border: "border-high/35", dot: "bg-high" },
  medium: {
    text: "text-medium",
    bg: "bg-medium/10",
    border: "border-medium/35",
    dot: "bg-medium",
  },
  low: { text: "text-low", bg: "bg-low/10", border: "border-low/35", dot: "bg-low" },
  info: { text: "text-info", bg: "bg-info/10", border: "border-info/30", dot: "bg-info" },
};

export function SeverityBadge({ severity, category }: { severity: Severity; category: string }) {
  const tone = TONE[severity];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[0.6875rem] tracking-[0.12em] uppercase ${tone.border} ${tone.bg} ${tone.text}`}
    >
      <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden />
      {SEVERITY_LABEL[severity]} · {category}
    </span>
  );
}

export function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const [open, setOpen] = useState(false);
  const tone = TONE[finding.severity];

  return (
    <article
      className="panel reveal relative overflow-hidden p-5"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <span className={`absolute inset-y-0 left-0 w-px ${tone.dot}`} aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[0.6875rem] tracking-[0.12em] uppercase ${tone.border} ${tone.bg} ${tone.text}`}
        >
          <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden />
          {badgeLabel(finding)} · {finding.category}
        </span>
        <span className="eyebrow">Finding {String(index + 1).padStart(2, "0")}</span>
      </div>

      <h3 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
        {finding.subject}
      </h3>
      <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {finding.field}
      </p>
      <p className="text-sm text-muted-foreground">{finding.changed}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <ValueBlock label="Staging" value={finding.stagingValue} accent="staging" />
        <ArrowRight className="mx-auto hidden size-4 text-muted-foreground sm:block" aria-hidden />
        <ValueBlock label="Production" value={finding.productionValue} accent="production" />
      </div>

      <p className="mt-4 border-l-2 border-border-strong pl-3 text-sm leading-relaxed text-muted-foreground">
        {finding.why}
      </p>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronRight
          className={`size-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        Technical details
      </button>

      {open && (
        <div className="reveal mt-3 overflow-x-auto rounded-lg border border-border bg-elevated/60">
          <table className="w-full min-w-[420px] text-left font-mono text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-normal">field</th>
                <th className="px-3 py-2 font-normal">staging</th>
                <th className="px-3 py-2 font-normal">production</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(finding.details).map(([key, pair]) => (
                <tr key={key} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">{key}</td>
                  <td className="px-3 py-2 break-all text-foreground">{render(pair.staging)}</td>
                  <td className="px-3 py-2 break-all text-foreground">{render(pair.production)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function render(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ValueBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "staging" | "production";
}) {
  const missing = value === "Missing";
  return (
    <div className="rounded-lg border border-border bg-elevated/50 px-3 py-2.5">
      <p className="eyebrow flex items-center gap-1.5">
        <span
          className={`size-1.5 rounded-full ${accent === "staging" ? "bg-staging" : "bg-production"}`}
          aria-hidden
        />
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-sm break-all ${missing ? "text-high" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}
