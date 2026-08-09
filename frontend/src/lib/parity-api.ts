/**
 * Thin client for the existing Express API. This is the ONLY data source.
 *   GET /api/projects
 *   GET /api/compare?stagingId={id}&productionId={id}
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

export type Finding = {
  id: string;
  severity: Severity;
  classification: BackendClassification;
  category: string;
  subject: string;
  changed: string;
  stagingValue: string;
  productionValue: string;
  why: string;
  details: Record<string, { staging: unknown; production: unknown }>;
  service?: string;
  field: string;
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
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function str(value: unknown): string {
  if (value === undefined || value === null) return MISSING;
  if (typeof value === "string") return value.length ? value : MISSING;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return MISSING;
  if (typeof value === "string") return value.length ? value : MISSING;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(", ");
    const record = asRecord(value);
    if (record["sensitive"] === true) return "[REDACTED]";
    if (record["value"] !== undefined) return formatValue(record["value"]);
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Base URL of the existing Express API. Same-origin by default; set
 * VITE_API_BASE_URL when the Express service runs on another host/port.
 */
const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> })
  .env;
const API_BASE = String(env?.VITE_API_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function getJson(path: string): Promise<unknown> {
  const url = apiUrl(path);
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" } });
  } catch {
    throw new Error(`Could not reach the API at ${url}. Is the Express service running?`);
  }
  const text = await response.text();
  if (!response.ok) {
    // The frontend host has no /api routes of its own, so an unreachable Express
    // service surfaces as an HTML/SSR error from this origin instead of JSON.
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
    if (Array.isArray(record[key])) return record[key] as unknown[];
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

/** Guess which listed project is staging / production by name. */
export function guessPair(projects: Project[]): {
  staging: Project | undefined;
  production: Project | undefined;
} {
  const match = (needles: string[]) =>
    projects.find((p) =>
      needles.some((n) => `${p.name} ${p.environment ?? ""}`.toLowerCase().includes(n)),
    );
  const staging = match(["staging", "stage", "dev", "test"]) ?? projects[0];
  const production =
    match(["production", "prod", "live"]) ?? projects.find((p) => p.id !== staging?.id);
  return { staging, production };
}

const SEVERITIES: Severity[] = ["high", "medium", "low", "info"];

function normalizeSeverity(value: unknown, expected: boolean): Severity {
  if (expected) return "info";
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("crit") || raw.includes("high") || raw.includes("error")) return "high";
  if (raw.includes("med") || raw.includes("warn")) return "medium";
  if (raw.includes("info") || raw.includes("expect") || raw.includes("notice")) return "info";
  if (raw.includes("low")) return "low";
  return SEVERITIES.includes(raw as Severity) ? (raw as Severity) : "medium";
}

const PATH_LABELS: Array<[RegExp, string]> = [
  [/runtime.*version|version.*runtime/i, "Runtime version"],
  [/\benv(ironment)?(vars|variables)?\b.*\bvalue\b/i, "Environment variable value"],
  [/envvar|environmentvariable|\benv\b/i, "Environment variable"],
  [/replica|scal|minContainers|maxContainers/i, "Scaling configuration"],
  [/cpu|ram|memory|disk|resource/i, "Resource allocation"],
  [/port/i, "Exposed ports"],
  [/domain|hostname|subdomain|url/i, "Public routing"],
  [/mode|ha\b|highavailability/i, "Availability mode"],
  [/service/i, "Service configuration"],
];

/** Turn a technical path like services.0.runtime.versionNumber into a human label. */
function humanizePath(path: string): string {
  for (const [pattern, label] of PATH_LABELS) {
    if (pattern.test(path)) return label;
  }
  const leaf = path
    .split(/[.[\]/]/)
    .filter((part) => part && !/^\d+$/.test(part))
    .pop();
  if (!leaf) return "Configuration";
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function categoryFor(path: string, staging: unknown, production: unknown, expected: boolean) {
  if (expected) return "Expected difference";
  if (production === undefined || production === null || production === "")
    return "Missing configuration";
  if (staging === undefined || staging === null || staging === "") return "Extra configuration";
  if (/runtime|version|base/i.test(path)) return "Runtime mismatch";
  if (/replica|scal|cpu|ram|memory|disk|container/i.test(path)) return "Capacity drift";
  if (/port|domain|route|host/i.test(path)) return "Networking drift";
  if (/env|secret|variable/i.test(path)) return "Configuration drift";
  return "Configuration drift";
}

function whyFor(category: string, label: string): string {
  switch (category) {
    case "Runtime mismatch":
      return "Production is running a different runtime version than staging, so code validated in staging is not guaranteed to behave the same in production.";
    case "Missing configuration":
      return "This value exists in staging but is missing from production, which usually means a deploy step or secret was never promoted.";
    case "Extra configuration":
      return "Production carries a value staging does not, so staging cannot reproduce production behaviour.";
    case "Capacity drift":
      return "Staging and production are sized differently, so load and performance testing in staging is not representative.";
    case "Networking drift":
      return "Traffic routing differs between environments, which can hide connectivity or CORS failures until production.";
    case "Expected difference":
      return "This difference is intentional and part of how the environments are meant to differ.";
    default:
      return `${label} differs between staging and production and may cause environment-specific behaviour.`;
  }
}

function isExpected(path: string, record: Record<string, unknown>): boolean {
  if (record["expected"] === true || record["intentional"] === true) return true;
  const flag = String(pick(record, ["severity", "level", "kind", "type"]) ?? "");
  if (/expected|intentional|ignored/i.test(flag)) return true;
  return /\b(env(ironment)?(name)?|stage|projectname|projectid|hostname|domain|serviceid|id)\b$/i.test(
    path.split(".").pop() ?? "",
  );
}

/** Collect leaf-level differences between two arbitrary config snapshots. */
function diffSnapshots(
  staging: unknown,
  production: unknown,
  path: string,
  out: Array<{ path: string; staging: unknown; production: unknown }>,
) {
  if (out.length > 400) return;
  const bothObjects =
    staging && production && typeof staging === "object" && typeof production === "object";
  if (bothObjects) {
    if (Array.isArray(staging) || Array.isArray(production)) {
      const a = Array.isArray(staging) ? staging : [];
      const b = Array.isArray(production) ? production : [];
      const length = Math.max(a.length, b.length);
      for (let i = 0; i < length; i += 1) {
        diffSnapshots(a[i], b[i], `${path}.${i}`, out);
      }
      return;
    }
    const a = asRecord(staging);
    const b = asRecord(production);
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      diffSnapshots(a[key], b[key], path ? `${path}.${key}` : key, out);
    }
    return;
  }
  if (JSON.stringify(staging ?? null) !== JSON.stringify(production ?? null)) {
    out.push({ path: path || "configuration", staging, production });
  }
}

function findingFromRecord(record: Record<string, unknown>, index: number): Finding {
  const path = str(
    pick(record, ["path", "key", "field", "pointer", "name", "label"]) ?? `finding-${index}`,
  );
  const subjectRaw = pick(record, ["service", "serviceName", "subject", "scope", "hostname"]);
  const stagingValue = pick(record, ["staging", "stagingValue", "left", "before", "expectedValue"]);
  const productionValue = pick(record, [
    "production",
    "productionValue",
    "right",
    "after",
    "actualValue",
  ]);
  const expected = isExpected(path, record);
  const category = str(
    pick(record, ["category", "rule", "type"]) ??
      categoryFor(path, stagingValue, productionValue, expected),
  );
  const label = humanizePath(path);
  const detailsRecord = asRecord(pick(record, ["details", "technicalDetails", "meta"]));
  const details: Finding["details"] = {};
  for (const [key, value] of Object.entries(detailsRecord)) {
    const pairish = asRecord(value);
    details[key] = {
      staging: "staging" in pairish ? pairish["staging"] : value,
      production: "production" in pairish ? pairish["production"] : undefined,
    };
  }
  if (!Object.keys(details).length) {
    details[path] = { staging: stagingValue, production: productionValue };
  }
  return {
    id: `${path}-${index}`,
    severity: normalizeSeverity(pick(record, ["severity", "level", "impact"]), expected),
    category: category.replace(/[_-]+/g, " "),
    subject: str(subjectRaw ?? label),
    changed: label,
    stagingValue: str(stagingValue),
    productionValue: str(productionValue),
    why: str(
      pick(record, ["why", "reason", "message", "description", "explanation"]) ?? "",
    ).replace(new RegExp(`^${MISSING}$`), whyFor(category, label)),
    details,
  };
}

function findingFromDiff(
  diff: { path: string; staging: unknown; production: unknown },
  index: number,
): Finding {
  const expected = isExpected(diff.path, {});
  const category = categoryFor(diff.path, diff.staging, diff.production, expected);
  const label = humanizePath(diff.path);
  const serviceMatch = /services?\.(\d+)/.exec(diff.path);
  const leafKey = diff.path.split(".").pop() ?? diff.path;
  return {
    id: `${diff.path}-${index}`,
    severity: expected
      ? "info"
      : category === "Runtime mismatch" || category === "Missing configuration"
        ? "high"
        : category === "Capacity drift" || category === "Networking drift"
          ? "medium"
          : "low",
    category,
    subject: serviceMatch ? `Service #${Number(serviceMatch[1]) + 1}` : leafKey,
    changed: label,
    stagingValue: str(diff.staging),
    productionValue: str(diff.production),
    why: whyFor(category, label),
    details: { [diff.path]: { staging: diff.staging, production: diff.production } },
  };
}

/** Collapse near-duplicate leaf diffs (e.g. versionName + versionNumber) into one finding. */
function priorityFor(finding: Finding): number {
  if (finding.classification === "EXPECTED") return 100 + SEVERITIES.indexOf(finding.severity);
  if (finding.classification === "UNCLASSIFIED") return 200 + SEVERITIES.indexOf(finding.severity);
  return SEVERITIES.indexOf(finding.severity);
}

function mergeFindings(findings: Finding[]): Finding[] {
  const merged = new Map<string, Finding>();
  for (const finding of findings) {
    const key = `${finding.subject}::${finding.category}::${finding.changed}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, finding);
      continue;
    }
    existing.details = { ...existing.details, ...finding.details };
    if (priorityFor(finding) < priorityFor(existing)) {
      existing.severity = finding.severity;
      existing.classification = finding.classification;
    }
  }
  return [...merged.values()].sort((a, b) => priorityFor(a) - priorityFor(b));
}

function normalizeClassification(value: unknown): BackendClassification {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "EXPECTED") return "EXPECTED";
  if (raw === "UNCLASSIFIED") return "UNCLASSIFIED";
  return "DRIFT";
}

function mapBackendFinding(finding: BackendFinding, index: number): Finding {
  const classification = normalizeClassification(finding.classification);
  const severity = normalizeSeverity(finding.severity, classification === "EXPECTED");
  const field = str(finding.field);
  const category = str(finding.category);
  const service = finding.service ? str(finding.service) : undefined;
  const subject = service ?? field;
  const changed = humanizePath(field) || category;
  const detailsRecord = asRecord(finding.details);
  const details: Finding["details"] = {};
  for (const [key, value] of Object.entries(detailsRecord)) {
    const pairish = asRecord(value);
    details[key] = {
      staging: "staging" in pairish ? pairish["staging"] : value,
      production: "production" in pairish ? pairish["production"] : undefined,
    };
  }

  return {
    id: `${field}-${index}`,
    severity,
    classification,
    category,
    subject,
    changed,
    stagingValue: formatValue(finding.staging),
    productionValue: formatValue(finding.production),
    why: str(finding.explanation),
    details,
    service,
    field,
  };
}

export async function fetchComparison(
  stagingId: string,
  productionId: string,
): Promise<ComparisonResult> {
  const payload = await getJson(
    `/api/compare?stagingId=${encodeURIComponent(stagingId)}&productionId=${encodeURIComponent(productionId)}`,
  );
  const record = asRecord(payload) as Partial<ComparisonResponse>;

  const backendFindings = collectList(record["findings"] ?? payload).filter(
    (entry) => entry && typeof entry === "object",
  );

  let findings: Finding[];
  let summary: ComparisonSummary;
  let rawChangeCount: number;

  if (backendFindings.length && Array.isArray(record["findings"])) {
    findings = (record.findings ?? []).map((entry, index) => mapBackendFinding(entry, index));
    summary = {
      total: Number(record.summary?.total ?? findings.length),
      critical: Number(record.summary?.critical ?? 0),
      high: Number(record.summary?.high ?? 0),
      medium: Number(record.summary?.medium ?? 0),
      low: Number(record.summary?.low ?? 0),
      info: Number(record.summary?.info ?? 0),
    };
    rawChangeCount = Number(record.summary?.total ?? findings.length);
  } else {
    const reported = backendFindings.filter((entry) => entry && typeof entry === "object");
    if (reported.length) {
      findings = mergeFindings(reported.map((entry, i) => findingFromRecord(asRecord(entry), i)));
      rawChangeCount = Number(
        pick(record, ["rawChangeCount", "rawChanges", "totalChanges", "changeCount"]) ??
          reported.length,
      );
    } else {
      const stagingSnapshot =
        pick(record, ["staging", "stagingConfig", "left", "source"]) ?? record["a"];
      const productionSnapshot =
        pick(record, ["production", "productionConfig", "right", "target"]) ?? record["b"];
      const diffs: Array<{ path: string; staging: unknown; production: unknown }> = [];
      diffSnapshots(stagingSnapshot, productionSnapshot, "", diffs);
      rawChangeCount = diffs.length;
      findings = mergeFindings(diffs.map(findingFromDiff));
    }
    summary = {
      total: findings.length,
      critical: findings.filter((item) => item.severity === "high").length,
      high: findings.filter((item) => item.severity === "high").length,
      medium: findings.filter((item) => item.severity === "medium").length,
      low: findings.filter((item) => item.severity === "low").length,
      info: findings.filter((item) => item.severity === "info").length,
    };
  }

  return {
    summary,
    rawChangeCount: Math.max(rawChangeCount, findings.length),
    findings,
    raw: payload,
  };
}
