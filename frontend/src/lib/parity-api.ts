/**
 * Thin client for the existing Express API.
 *
 * This is the ONLY data source.
 *
 * GET /api/projects
 * GET /api/compare?stagingId={id}&productionId={id}
 *
 * No mocks, no fallbacks — errors surface to the UI.
 */

export type Project = {
  id: string;
  name: string;
  environment?: string | null;
  region?: string | null;
  serviceCount?: number | null;
  raw: Record<string, unknown>;
};

export type Severity = "high" | "medium" | "low" | "info";

export type BackendSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type BackendClassification = "DRIFT" | "EXPECTED" | "UNCLASSIFIED";

export interface ComparisonSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface BackendFinding {
  category: string;
  service?: string;
  subject: string;
  field: string;
  staging?: unknown;
  production?: unknown;
  severity: BackendSeverity;
  classification: BackendClassification;
  explanation: string;
  details?: Record<string, unknown>;
}

export interface ComparisonResponse {
  staging: {
    projectId: string;
    projectName: string;
  };
  production: {
    projectId: string;
    projectName: string;
  };
  summary: ComparisonSummary;
  findings: BackendFinding[];
}

export type FindingDetail = {
  staging: unknown;
  production: unknown;
};

export type Finding = {
  id: string;
  severity: Severity;
  classification: BackendClassification;

  category: string;

  /**
   * Primary human-readable subject.
   * Example:
   *   Node.js runtime
   *   PARITY_TEST
   *   Environment identity
   */
  subject: string;

  /**
   * Specific property being compared.
   * Example:
   *   Version
   *   Environment variable
   *   Environment type
   */
  field: string;

  /**
   * Human-readable description of what changed.
   */
  changed: string;

  stagingValue: string;
  productionValue: string;

  why: string;

  details: Record<string, FindingDetail>;

  service?: string;
};

export type ComparisonResult = {
  summary: ComparisonSummary;
  rawChangeCount: number;
  findings: Finding[];
  raw: unknown;
};

const MISSING = "Missing";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = obj[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function str(value: unknown): string {
  if (value === undefined || value === null) return MISSING;

  if (typeof value === "string") {
    return value.length ? value : MISSING;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return MISSING;

  if (typeof value === "string") {
    return value.length ? value : MISSING;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return value.map(formatValue).join(", ");
    }

    const record = asRecord(value);

    if (record["sensitive"] === true) {
      return "[REDACTED]";
    }

    if (record["value"] !== undefined) {
      return formatValue(record["value"]);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

const env = (
  import.meta as ImportMeta & {
    env?: Record<string, string | boolean | undefined>;
  }
).env;

const API_BASE = String(env?.VITE_API_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function getJson(path: string): Promise<unknown> {
  const url = apiUrl(path);

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
    });
  } catch {
    throw new Error(`Could not reach the API at ${url}. Is the Express service running?`);
  }

  const text = await response.text();

  if (!response.ok) {
    if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
      throw new Error(
        `No Express API is answering ${url} (HTTP ${response.status}). Start the Express service, or set VITE_API_BASE_URL to its address.`,
      );
    }

    throw new Error(`API responded ${response.status} ${response.statusText} for ${url}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`API returned a non-JSON response for ${url}`);
  }
}

function collectList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  const record = asRecord(payload);

  for (const key of ["projects", "items", "data", "results", "list"]) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  return [];
}

export async function fetchProjects(): Promise<Project[]> {
  const payload = await getJson("/api/projects");

  return collectList(payload).map((entry, index) => {
    const record = asRecord(entry);
    const services = record["services"];

    return {
      id: str(pick(record, ["id", "projectId", "_id", "clientId"]) ?? `project-${index}`),

      name: str(pick(record, ["name", "projectName", "title", "id"]) ?? `Project ${index + 1}`),

      environment: (pick(record, ["environment", "env", "stage", "tag"]) as string) ?? null,

      region: (pick(record, ["region", "location", "zone"]) as string) ?? null,

      serviceCount: Array.isArray(services) ? services.length : null,

      raw: record,
    };
  });
}

export function guessPair(projects: Project[]): {
  staging: Project | undefined;
  production: Project | undefined;
} {
  const match = (needles: string[]) =>
    projects.find((project) =>
      needles.some((needle) =>
        `${project.name} ${project.environment ?? ""}`.toLowerCase().includes(needle),
      ),
    );

  const staging = match(["staging", "stage", "dev", "test"]) ?? projects[0];

  const production =
    match(["production", "prod", "live"]) ?? projects.find((project) => project.id !== staging?.id);

  return {
    staging,
    production,
  };
}

function normalizeSeverity(value: unknown, expected: boolean): Severity {
  if (expected) return "info";

  const raw = String(value ?? "").toLowerCase();

  if (raw.includes("crit") || raw.includes("high") || raw.includes("error")) {
    return "high";
  }

  if (raw.includes("med") || raw.includes("warn")) {
    return "medium";
  }

  if (raw.includes("info") || raw.includes("expect") || raw.includes("notice")) {
    return "info";
  }

  if (raw.includes("low")) return "low";

  return "medium";
}

function humanizePath(path: string): string {
  const leaf = path
    .split(/[.[\]/]/)
    .filter((part) => part && !/^\d+$/.test(part))
    .pop();

  if (!leaf) return "Configuration";

  return leaf
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function normalizeClassification(value: unknown): BackendClassification {
  const raw = String(value ?? "").toUpperCase();

  if (raw === "EXPECTED") return "EXPECTED";
  if (raw === "UNCLASSIFIED") return "UNCLASSIFIED";

  return "DRIFT";
}

function normalizeDetails(
  details: Record<string, unknown> | undefined,
  staging: unknown,
  production: unknown,
): Finding["details"] {
  const result: Finding["details"] = {};

  if (details) {
    for (const [key, value] of Object.entries(details)) {
      const record = asRecord(value);

      /*
       * Backend grouped runtime details:
       *
       * {
       *   stagingRuntime: {...},
       *   productionRuntime: {...}
       * }
       *
       * Keep these as separate technical rows rather than showing
       * production as "—".
       */
      if (key === "stagingRuntime" && value && typeof value === "object") {
        result["Runtime"] = {
          staging: value,
          production: details["productionRuntime"],
        };

        continue;
      }

      if (key === "productionRuntime") {
        if (result["Runtime"]) continue;

        result["Runtime"] = {
          staging: details["stagingRuntime"],
          production: value,
        };

        continue;
      }

      result[key] = {
        staging: "staging" in record ? record["staging"] : value,

        production: "production" in record ? record["production"] : undefined,
      };
    }
  }

  if (!Object.keys(result).length) {
    result["Compared value"] = {
      staging,
      production,
    };
  }

  return result;
}

function mapBackendFinding(finding: BackendFinding, index: number): Finding {
  const classification = normalizeClassification(finding.classification);

  const severity = normalizeSeverity(finding.severity, classification === "EXPECTED");

  const service = finding.service ? String(finding.service) : undefined;

  /*
   * Backend subject is now the canonical UI subject.
   *
   * Examples:
   *   Node.js runtime
   *   PARITY_TEST
   *   Environment identity
   */
  const subject = finding.subject || service || finding.field || finding.category;

  const field = finding.field || finding.category;

  return {
    id: `${finding.category}-${finding.field}-${index}`,

    severity,

    classification,

    category: finding.category,

    subject,

    field,

    changed: field,

    stagingValue: formatValue(finding.staging),

    productionValue: formatValue(finding.production),

    why: finding.explanation,

    details: normalizeDetails(finding.details, finding.staging, finding.production),

    service,
  };
}

export async function fetchComparison(
  stagingId: string,
  productionId: string,
): Promise<ComparisonResult> {
  const payload = await getJson(
    `/api/compare?stagingId=${encodeURIComponent(stagingId)}&productionId=${encodeURIComponent(
      productionId,
    )}`,
  );

  const record = asRecord(payload) as Partial<ComparisonResponse>;

  const findingsPayload = record["findings"];

  const backendFindings = Array.isArray(findingsPayload)
    ? findingsPayload.filter((entry): entry is BackendFinding =>
        Boolean(entry && typeof entry === "object"),
      )
    : [];

  const findings = backendFindings.map(mapBackendFinding);

  const summary: ComparisonSummary = {
    total: Number(record.summary?.total ?? findings.length),

    critical: Number(record.summary?.critical ?? 0),

    high: Number(
      record.summary?.high ?? findings.filter((finding) => finding.severity === "high").length,
    ),

    medium: Number(
      record.summary?.medium ?? findings.filter((finding) => finding.severity === "medium").length,
    ),

    low: Number(
      record.summary?.low ?? findings.filter((finding) => finding.severity === "low").length,
    ),

    info: Number(
      record.summary?.info ?? findings.filter((finding) => finding.severity === "info").length,
    ),
  };

  return {
    summary,

    rawChangeCount: summary.total,

    findings,

    raw: payload,
  };
}
