import { Cpu, ShieldCheck } from "lucide-react";
import type { Project } from "@/lib/parity-api";

type Props = {
  role: "staging" | "production";
  project: Project | undefined;
  projects: Project[];
  onChange: (id: string) => void;
};

export function EnvironmentCard({ role, project, projects, onChange }: Props) {
  const isStaging = role === "staging";
  return (
    <div className="panel relative overflow-hidden p-5">
      <span
        className={`absolute inset-x-0 top-0 h-px ${isStaging ? "bg-staging/60" : "bg-production/60"}`}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow flex items-center gap-2">
          <span
            className={`size-1.5 rounded-full ${isStaging ? "bg-staging" : "bg-production"}`}
            aria-hidden
          />
          {isStaging ? "Staging" : "Production"}
        </span>
        <span className="eyebrow">{isStaging ? "source of truth" : "TARGET ENVIRONMENT"}</span>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Select {role} project</span>
        <select
          value={project?.id ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-lg border border-border bg-elevated px-3 py-2.5 text-base font-medium text-foreground outline-none transition-colors hover:border-border-strong focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
        >
          {projects.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Meta icon={<Cpu className="size-3.5" />} label="Project ID">
          <span className="font-mono text-xs">{project?.id ?? "—"}</span>
        </Meta>
        <Meta icon={<ShieldCheck className="size-3.5" />} label="Environment">
          {project?.environment ?? role}
        </Meta>
      </dl>
    </div>
  );
}

function Meta({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-elevated/40 px-3 py-2">
      <dt className="eyebrow flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm text-foreground">{children}</dd>
    </div>
  );
}
