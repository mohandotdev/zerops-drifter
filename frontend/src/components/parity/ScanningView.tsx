import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

export const SCAN_STEPS = [
  "Loading staging environment",
  "Loading production environment",
  "Normalizing configuration",
  "Comparing configuration",
  "Applying semantic drift rules",
  "Producing findings",
];

/** Drives the scan step timeline over ~2.8s. */
export function useScanProgress(active: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    setStep(0);
    const timers = SCAN_STEPS.map((_, index) =>
      setTimeout(() => setStep(index + 1), (index + 1) * 460),
    );
    return () => timers.forEach(clearTimeout);
  }, [active]);
  return step;
}

export function ScanningView({ step }: { step: number }) {
  return (
    <div className="panel overflow-hidden">
      <div className="relative h-px w-full overflow-hidden bg-border">
        <span className="sweep-line absolute inset-y-0 w-1/3 bg-primary" aria-hidden />
      </div>
      <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-8">
        <ScanDiagram step={step} />
        <ol className="flex flex-col justify-center gap-2" aria-live="polite">
          {SCAN_STEPS.map((label, index) => {
            const done = step > index;
            const active = step === index;
            return (
              <li
                key={label}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all duration-500 ${
                  done
                    ? "border-border bg-elevated/60 text-foreground"
                    : active
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-transparent text-muted-foreground"
                }`}
              >
                {done ? (
                  <Check className="size-4 text-primary" aria-hidden />
                ) : active ? (
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                ) : (
                  <span className="size-4 rounded-full border border-border-strong" aria-hidden />
                )}
                <span className="tracking-tight">{label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function ScanDiagram({ step }: { step: number }) {
  const engineHot = step >= 3;
  return (
    <svg
      viewBox="0 0 420 240"
      className="mx-auto w-full max-w-[460px]"
      role="img"
      aria-label="Staging and production configuration flowing into the comparison engine"
    >
      <defs>
        <linearGradient id="pr-engine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      <path
        d="M92 62 C 200 62, 190 120, 300 120"
        fill="none"
        stroke="var(--staging)"
        strokeWidth="1.5"
        strokeOpacity={step >= 1 ? 0.9 : 0.25}
        className={step >= 1 ? "flow-dash" : ""}
      />
      <path
        d="M92 178 C 200 178, 190 120, 300 120"
        fill="none"
        stroke="var(--production)"
        strokeWidth="1.5"
        strokeOpacity={step >= 2 ? 0.9 : 0.25}
        className={step >= 2 ? "flow-dash" : ""}
      />

      <g className={step >= 1 ? "pulse-node" : ""} style={{ transformOrigin: "52px 62px" }}>
        <rect
          x="12"
          y="42"
          width="80"
          height="40"
          rx="10"
          fill="var(--elevated)"
          stroke="var(--staging)"
          strokeOpacity="0.6"
        />
        <text x="52" y="66" textAnchor="middle" fontSize="11" fill="var(--foreground)">
          STAGING
        </text>
      </g>

      <g className={step >= 2 ? "pulse-node" : ""} style={{ transformOrigin: "52px 178px" }}>
        <rect
          x="12"
          y="158"
          width="80"
          height="40"
          rx="10"
          fill="var(--elevated)"
          stroke="var(--production)"
          strokeOpacity="0.6"
        />
        <text x="52" y="182" textAnchor="middle" fontSize="11" fill="var(--foreground)">
          PRODUCTION
        </text>
      </g>

      <g style={{ transformOrigin: "300px 120px" }} className={engineHot ? "pulse-node" : ""}>
        <circle
          cx="300"
          cy="120"
          r="54"
          fill="url(#pr-engine)"
          stroke="var(--border-strong)"
          strokeOpacity="0.9"
        />
        <g className="spin-slow" style={{ transformOrigin: "300px 120px" }}>
          <circle
            cx="300"
            cy="120"
            r="40"
            fill="none"
            stroke="var(--primary)"
            strokeOpacity="0.5"
            strokeDasharray="6 10"
          />
        </g>
        <text x="300" y="115" textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
          SEMANTIC
        </text>
        <text x="300" y="130" textAnchor="middle" fontSize="10" fill="var(--foreground)">
          COMPARISON
        </text>
      </g>

      <path
        d="M354 120 H 404"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeOpacity={step >= 5 ? 0.9 : 0.2}
        className={step >= 5 ? "flow-dash" : ""}
      />
    </svg>
  );
}
