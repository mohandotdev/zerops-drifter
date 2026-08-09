import { ArrowDown } from "lucide-react";

const STAGES = ["Staging", "Configuration snapshot", "Semantic comparison", "Production"];

export function PipelineHeader({ activeIndex = -1 }: { activeIndex?: number }) {
  return (
    <div className="panel p-5">
      <p className="eyebrow">Comparison pipeline</p>
      <ol className="mt-4 flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-2">
        {STAGES.map((stage, index) => {
          const done = activeIndex > index;
          const active = activeIndex === index;
          return (
            <li key={stage} className="flex flex-1 flex-col sm:flex-row sm:items-center">
              <div
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-500 ${
                  active
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : done
                      ? "border-border-strong bg-elevated text-foreground"
                      : "border-border bg-elevated/40 text-muted-foreground"
                }`}
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${
                    active ? "bg-primary pulse-node" : done ? "bg-primary/60" : "bg-border-strong"
                  }`}
                  aria-hidden
                />
                <span className="truncate font-medium tracking-tight">{stage}</span>
              </div>
              {index < STAGES.length - 1 && (
                <>
                  <ArrowDown
                    className="my-1 size-3.5 self-center text-muted-foreground sm:hidden"
                    aria-hidden
                  />
                  <span
                    className="mx-2 hidden h-px flex-1 bg-border-strong sm:block"
                    aria-hidden
                  />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
