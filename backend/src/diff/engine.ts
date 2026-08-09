import diff from "microdiff";
import { EnvironmentSnapshot } from "../models/environment-snapshot.js";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface DriftFinding {
  category: string;
  service?: string;
  field: string;
  staging?: unknown;
  production?: unknown;
  severity: Severity;
  classification: "DRIFT" | "EXPECTED" | "UNCLASSIFIED";
  explanation: string;
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
    services: snapshot.services.map((service) => ({
      name: service.name,
      runtime: service.runtime,
      startup: service.startup,
      resources: service.resources,
      autoscaling: service.autoscaling,
      networking: service.networking,
    })),
  };
}

function pathToString(path: (string | number)[]) {
  return path.map(String).join(".");
}

/**
 * microdiff sees services as an array:
 *
 * services.0.runtime.versionName
 *
 * Convert the array index back into the actual Zerops service name.
 */
function getServiceName(
  path: string,
  snapshot: EnvironmentSnapshot,
): string | undefined {
  const parts = path.split(".");

  if (parts[0] !== "services") return undefined;

  const serviceIndex = Number(parts[1]);

  if (!Number.isInteger(serviceIndex)) return undefined;

  return snapshot.services[serviceIndex]?.name;
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

    const service = getServiceName(path, staging);

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
      field: "runtime",
      staging:
        oldRuntime.versionNumber ?? oldRuntime.versionName ?? oldRuntime.base,
      production:
        newRuntime.versionNumber ?? newRuntime.versionName ?? newRuntime.base,
      severity: "HIGH",
      classification: "DRIFT",
      explanation: `Runtime configuration differs between staging and production for ${service}.`,
      details: {
        stagingRuntime: oldRuntime,
        productionRuntime: newRuntime,
      },
    };
  });
}

function buildVariableFinding(path: string, change: any): DriftFinding {
  const name = path.split(".").slice(1).join(".");

  const sensitive = Boolean(
    change.value === "[REDACTED]" || change.oldValue === "[REDACTED]",
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
    field: name,
    staging: sensitive ? "[REDACTED]" : change.oldValue,
    production: sensitive ? "[REDACTED]" : change.value,
    severity:
      change.type === "CREATE" || change.type === "REMOVE" ? "HIGH" : "LOW",
    classification: "DRIFT",
    explanation,
  };
}

function buildAutoscalingFinding(
  path: string,
  change: any,
  staging: EnvironmentSnapshot,
): DriftFinding {
  const service = getServiceName(path, staging);

  return {
    category: "capacity",
    service,
    field: path,
    staging: change.oldValue,
    production: change.value,
    severity: "MEDIUM",
    classification: "DRIFT",
    explanation: `Resource or autoscaling configuration differs for ${
      service ?? "the service"
    }.`,
  };
}

function buildGenericFinding(
  path: string,
  change: any,
  staging: EnvironmentSnapshot,
): DriftFinding {
  const service = getServiceName(path, staging);

  if (path.includes(".startup.")) {
    return {
      category: "startup",
      service,
      field: path,
      staging: change.oldValue,
      production: change.value,
      severity: "LOW",
      classification: "DRIFT",
      explanation: `Startup behavior differs for ${service ?? "the service"}.`,
    };
  }

  if (path.includes(".networking.")) {
    return {
      category: "networking",
      service,
      field: path,
      staging: change.oldValue,
      production: change.value,
      severity: "LOW",
      classification: "DRIFT",
      explanation: `Networking configuration differs for ${
        service ?? "the service"
      }.`,
    };
  }

  return {
    category: "unknown",
    service,
    field: path,
    staging: change.oldValue,
    production: change.value,
    severity: "INFO",
    classification: "UNCLASSIFIED",
    explanation:
      "A configuration difference was detected but no specific rule exists yet.",
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
      field: "envType",
      staging: staging.environment.type,
      production: production.environment.type,
      severity: "INFO",
      classification: "EXPECTED",
      explanation: "Environment identity differs by design.",
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
