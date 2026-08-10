import diff from "microdiff";
import { EnvironmentSnapshot } from "../models/environment-snapshot.js";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface DriftFinding {
  category: string;
  service?: string;

  /** Human-readable subject of the finding. */
  subject: string;

  /** Specific human-readable property being compared. */
  field: string;

  staging?: unknown;
  production?: unknown;

  severity: Severity;
  classification: "DRIFT" | "EXPECTED" | "UNCLASSIFIED";
  explanation: string;

  /** Low-level comparison data useful for technical inspection. */
  details?: Record<string, unknown>;
}

function comparable(snapshot: EnvironmentSnapshot) {
  return {
    environment: {},
    variables: Object.fromEntries(
      Object.entries(snapshot.variables).map(([key, variable]) => [
        key,
        {
          configured: variable.configured,
          sensitive: variable.sensitive ?? false,
          value: variable.sensitive ? "[REDACTED]" : variable.value,
        },
      ]),
    ),
    services: Object.fromEntries(
      snapshot.services.map((service) => [
        service.name,
        {
          runtime: service.runtime,
          startup: service.startup,
          resources: service.resources,
          autoscaling: service.autoscaling,
          networking: service.networking,
        },
      ]),
    ),
  };
}

function pathToString(path: (string | number)[]) {
  return path.map(String).join(".");
}

function formatRuntimeSubject(service: string): string {
  if (service.toLowerCase() === "nodejs") {
    return "Node.js runtime";
  }

  return `${service} runtime`;
}

function displayVariableValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return "Missing";
  }

  if (typeof value !== "object") {
    return value;
  }

  const variable = value as Record<string, unknown>;

  if (variable.sensitive === true) {
    return "[REDACTED]";
  }

  if (variable.configured === false) {
    return "Missing";
  }

  return variable.value ?? "Missing";
}

function displayConfigValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return "Missing";
  }

  if (typeof value === "object") {
    return value;
  }

  return value;
}

function getVariableProperty(value: unknown, property: string): unknown {
  if (!value || typeof value !== "object") return undefined;

  return (value as Record<string, unknown>)[property];
}

/**
 * Converts a low-level field name into a human-readable label.
 *
 * Examples:
 *   versionName      -> Version name
 *   minContainers    -> Min containers
 *   maxContainers    -> Max containers
 *   startCommand     -> Start command
 */
function formatFieldName(field: string): string {
  return field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Extract the field immediately after a configuration section.
 *
 * Example:
 * services.0.autoscaling.minContainers
 * -> minContainers
 */
function getSectionField(path: string, section: string): string {
  const marker = `.${section}.`;
  const index = path.indexOf(marker);

  if (index === -1) {
    return formatFieldName(path.split(".").at(-1) ?? "Configuration");
  }

  const field = path.slice(index + marker.length).split(".")[0];

  return formatFieldName(field);
}

/**
 * Services are keyed by service name in comparable().
 *
 * Example:
 * services.nodejs.runtime.versionNumber
 *
 * Extract the service name directly from the diff path.
 */
function getServiceName(path: string): string | undefined {
  const parts = path.split(".");

  if (parts[0] !== "services") return undefined;

  return parts[1] || undefined;
}

function isServiceRootPath(path: string): boolean {
  const parts = path.split(".");

  return parts.length === 2 && parts[0] === "services" && Boolean(parts[1]);
}

function getChangedValue(change: any, key: "oldValue" | "value") {
  return change[key];
}

/**
 * Convert low-level Zerops runtime field changes into one semantic finding.
 *
 * versionName, versionId, base and versionNumber all describe the same
 * runtime choice and should never appear as four separate user-facing drifts.
 */
function buildRuntimeFindings(
  rawChanges: any[],
  staging: EnvironmentSnapshot,
): DriftFinding[] {
  const grouped = new Map<string, any[]>();

  for (const change of rawChanges) {
    const path = pathToString(change.path);

    if (!path.startsWith("services.") || !path.includes(".runtime.")) {
      continue;
    }

    const service = getServiceName(path);

    if (!service) continue;

    const runtimeField = path.split(".runtime.")[1];

    if (
      runtimeField !== "versionName" &&
      runtimeField !== "versionId" &&
      runtimeField !== "base" &&
      runtimeField !== "versionNumber"
    ) {
      continue;
    }

    const list = grouped.get(service) ?? [];

    list.push(change);

    grouped.set(service, list);
  }

  return [...grouped.entries()].map(([service, changes]) => {
    const oldRuntime = Object.fromEntries(
      changes.map((change) => [
        pathToString(change.path).split(".runtime.")[1],
        getChangedValue(change, "oldValue"),
      ]),
    );

    const newRuntime = Object.fromEntries(
      changes.map((change) => [
        pathToString(change.path).split(".runtime.")[1],
        getChangedValue(change, "value"),
      ]),
    );

    return {
      category: "runtime",
      service,
      subject: formatRuntimeSubject(service),
      field: "Version",

      staging:
        oldRuntime.versionNumber ?? oldRuntime.versionName ?? oldRuntime.base,

      production:
        newRuntime.versionNumber ?? newRuntime.versionName ?? newRuntime.base,

      severity: "HIGH",
      classification: "DRIFT",

      explanation: `Runtime configuration differs between staging and production for ${service}.`,

      details: {
        versionName: {
          staging: oldRuntime.versionName,
          production: newRuntime.versionName,
        },
        versionId: {
          staging: oldRuntime.versionId,
          production: newRuntime.versionId,
        },
        base: {
          staging: oldRuntime.base,
          production: newRuntime.base,
        },
        versionNumber: {
          staging: oldRuntime.versionNumber,
          production: newRuntime.versionNumber,
        },
      },
    };
  });
}

function buildVariableFinding(path: string, change: any): DriftFinding {
  const name = path.split(".").slice(1).join(".");

  const sensitive = Boolean(
    displayVariableValue(change.value) === "[REDACTED]" ||
    displayVariableValue(change.oldValue) === "[REDACTED]",
  );

  let explanation: string;

  if (change.type === "CREATE") {
    explanation = `Variable ${name} exists in production but is missing from staging.`;
  } else if (change.type === "REMOVE") {
    explanation = `Variable ${name} exists in staging but is missing from production.`;
  } else {
    explanation = `Variable ${name} has different values between environments.`;
  }

  return {
    category: "environment-variable",

    // WHAT changed?
    subject: name,

    // WHAT kind of thing is it?
    field: "Environment variable",

    staging: sensitive ? "[REDACTED]" : displayVariableValue(change.oldValue),
    production: sensitive ? "[REDACTED]" : displayVariableValue(change.value),

    severity:
      change.type === "CREATE" || change.type === "REMOVE" ? "HIGH" : "LOW",

    classification: "DRIFT",

    explanation,

    details: {
      value: {
        staging: displayVariableValue(change.oldValue),
        production: displayVariableValue(change.value),
      },
      configured: {
        staging: getVariableProperty(change.oldValue, "configured"),
        production: getVariableProperty(change.value, "configured"),
      },
    },
  };
}

function buildAutoscalingFinding(
  path: string,
  change: any,
  staging: EnvironmentSnapshot,
): DriftFinding {
  const service = getServiceName(path);

  const field = path.includes(".autoscaling.")
    ? getSectionField(path, "autoscaling")
    : getSectionField(path, "resources");

  const subject = service ? `${service} capacity` : "Service capacity";

  return {
    category: "capacity",
    service,

    // WHAT is affected?
    subject,

    // WHICH property?
    field,

    staging: displayConfigValue(change.oldValue),
    production: displayConfigValue(change.value),

    severity: "MEDIUM",
    classification: "DRIFT",

    explanation: `Resource or autoscaling configuration differs for ${
      service ?? "the service"
    }.`,

    details: {
      path,
      oldValue: displayConfigValue(change.oldValue),
      newValue: displayConfigValue(change.value),
    },
  };
}

function buildServicePresenceFinding(path: string, change: any): DriftFinding {
  const service = getServiceName(path);

  return {
    category: "service",
    service,
    subject: service ? `${service} service` : "Service",
    field: "Service presence",
    staging: change.type === "REMOVE" ? "Present" : "Missing",
    production: change.type === "CREATE" ? "Present" : "Missing",
    severity: "HIGH",
    classification: "DRIFT",
    explanation:
      change.type === "REMOVE"
        ? `Service ${service ?? "unknown"} exists in staging but is missing from production.`
        : `Service ${service ?? "unknown"} exists in production but is missing from staging.`,
    details: {
      presence: {
        staging: change.type === "REMOVE" ? "Present" : "Missing",
        production: change.type === "CREATE" ? "Present" : "Missing",
      },
    },
  };
}

function buildGenericFinding(
  path: string,
  change: any,
  staging: EnvironmentSnapshot,
): DriftFinding {
  const service = getServiceName(path);

  if (path.includes(".startup.")) {
    const field = getSectionField(path, "startup");

    return {
      category: "startup",
      service,

      subject: service ? `${service} startup` : "Startup configuration",

      field,

      staging: displayConfigValue(change.oldValue),
      production: displayConfigValue(change.value),

      severity: "LOW",
      classification: "DRIFT",

      explanation: `Startup behavior differs for ${service ?? "the service"}.`,

      details: {
        path,
        oldValue: displayConfigValue(change.oldValue),
        newValue: displayConfigValue(change.value),
      },
    };
  }

  if (path.includes(".networking.")) {
    const field = getSectionField(path, "networking");

    return {
      category: "networking",
      service,

      subject: service ? `${service} networking` : "Networking configuration",

      field,

      staging: displayVariableValue(change.oldValue),
      production: displayVariableValue(change.value),

      severity: "LOW",
      classification: "DRIFT",

      explanation: `Networking configuration differs for ${
        service ?? "the service"
      }.`,

      details: {
        path,
        oldValue: displayVariableValue(change.oldValue),
        newValue: displayVariableValue(change.value),
      },
    };
  }

  return {
    category: "unknown",
    service,

    subject: service ? `${service} configuration` : "Configuration",

    field: formatFieldName(path.split(".").at(-1) ?? "Unknown"),

    staging: displayVariableValue(change.oldValue),
    production: displayVariableValue(change.value),

    severity: "INFO",
    classification: "UNCLASSIFIED",

    explanation:
      "A configuration difference was detected but no specific rule exists yet.",

    details: {
      path,
      oldValue: displayVariableValue(change.oldValue),
      newValue: displayVariableValue(change.value),
    },
  };
}

function buildFindings(
  rawChanges: any[],
  staging: EnvironmentSnapshot,
  production: EnvironmentSnapshot,
): DriftFinding[] {
  const findings: DriftFinding[] = [];

  // Environment identity is intentionally different.
  if (staging.environment.type !== production.environment.type) {
    findings.push({
      category: "environment",

      // WHAT is different?
      subject: "Environment identity",

      // WHICH property?
      field: "Environment type",

      staging: staging.environment.type,
      production: production.environment.type,

      severity: "INFO",
      classification: "EXPECTED",

      explanation: "Environment identity differs by design.",

      details: {
        stagingType: staging.environment.type,
        productionType: production.environment.type,
      },
    });
  }

  // Runtime changes are grouped into one semantic finding per service.
  findings.push(...buildRuntimeFindings(rawChanges, staging));

  // Do not emit the individual runtime fields again.
  const runtimePaths = new Set(
    rawChanges
      .filter((change) => {
        const path = pathToString(change.path);

        return (
          path.startsWith("services.") &&
          path.includes(".runtime.") &&
          ["versionName", "versionId", "base", "versionNumber"].includes(
            path.split(".runtime.")[1],
          )
        );
      })
      .map((change) => pathToString(change.path)),
  );

  for (const change of rawChanges) {
    const path = pathToString(change.path);

    // Already represented by the grouped runtime finding.
    if (runtimePaths.has(path)) continue;

    // Environment identity is handled above.
    if (path === "environment.envType" || path === "variables.envType") {
      continue;
    }

    // A whole service object is structural noise unless we explicitly
    // classify it as a service-presence difference.
    if (isServiceRootPath(path)) {
      findings.push(buildServicePresenceFinding(path, change));
      continue;
    }

    if (path.startsWith("variables.")) {
      findings.push(buildVariableFinding(path, change));
      continue;
    }

    if (path.includes(".autoscaling.") || path.includes(".resources.")) {
      findings.push(buildAutoscalingFinding(path, change, staging));
      continue;
    }

    findings.push(buildGenericFinding(path, change, staging));
  }

  return findings;
}

export function compareSnapshots(
  staging: EnvironmentSnapshot,
  production: EnvironmentSnapshot,
) {
  const rawChanges = diff(comparable(staging), comparable(production), {
    cyclesFix: false,
  });

  const findings = buildFindings(rawChanges, staging, production);

  return {
    staging: {
      projectId: staging.project.id,
      projectName: staging.project.name,
    },

    production: {
      projectId: production.project.id,
      projectName: production.project.name,
    },

    summary: {
      total: findings.length,
      critical: findings.filter((x) => x.severity === "CRITICAL").length,
      high: findings.filter((x) => x.severity === "HIGH").length,
      medium: findings.filter((x) => x.severity === "MEDIUM").length,
      low: findings.filter((x) => x.severity === "LOW").length,
      info: findings.filter((x) => x.severity === "INFO").length,
    },

    findings,
  };
}
