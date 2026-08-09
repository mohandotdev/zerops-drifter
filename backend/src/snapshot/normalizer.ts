import {
  EnvironmentSnapshot,
  EnvironmentVariable,
  ResourceConfig,
  AutoscalingConfig
} from "../models/environment-snapshot.js";

const SECRET_PATTERN =
  /(password|passwd|secret|token|api[_-]?key|private[_-]?key|credential)/i;

function parseEnvFile(content: string): Record<string, EnvironmentVariable> {
  const variables: Record<string, EnvironmentVariable> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equals = line.indexOf("=");
    if (equals <= 0) continue;

    const name = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // PROJECT_* variables are generated mirrors of user variables.
    if (name.startsWith("PROJECT_")) continue;

    const sensitive = SECRET_PATTERN.test(name);

    variables[name] = {
      name,
      value: sensitive ? undefined : value,
      configured: true,
      sensitive
    };
  }

  return variables;
}

function resourceConfig(input: any): ResourceConfig {
  if (!input) return {};

  return {
    min: input.minResource
      ? {
          cpuCoreCount: input.minResource.cpuCoreCount,
          memoryGBytes: input.minResource.memoryGBytes,
          diskGBytes: input.minResource.diskGBytes
        }
      : undefined,
    max: input.maxResource
      ? {
          cpuCoreCount: input.maxResource.cpuCoreCount,
          memoryGBytes: input.maxResource.memoryGBytes,
          diskGBytes: input.maxResource.diskGBytes
        }
      : undefined,
    minFree: input.minFreeResource
      ? {
          cpuCoreCount: input.minFreeResource.cpuCoreCount,
          cpuCorePercent: input.minFreeResource.cpuCorePercent,
          memoryGBytes: input.minFreeResource.memoryGBytes,
          memoryPercent: input.minFreeResource.memoryPercent
        }
      : undefined,
    cpuMode: input.cpuMode,
    startCpuCoreCount: input.startCpuCoreCount,
    swapEnabled: input.swapEnabled
  };
}

function autoscalingConfig(stack: any): AutoscalingConfig {
  const current = stack.currentAutoscaling ?? {};
  const custom = stack.customAutoscaling ?? {};

  return {
    vertical: resourceConfig(current.verticalAutoscaling),
    horizontal: current.horizontalAutoscaling
      ? {
          minContainerCount: current.horizontalAutoscaling.minContainerCount,
          maxContainerCount: current.horizontalAutoscaling.maxContainerCount
        }
      : undefined,
    customVertical: resourceConfig(custom.verticalAutoscaling),
    customHorizontal: custom.horizontalAutoscaling
      ? {
          minContainerCount: custom.horizontalAutoscaling.minContainerCount,
          maxContainerCount: custom.horizontalAutoscaling.maxContainerCount
        }
      : undefined
  };
}

export function normalizeSnapshot(
  project: any,
  envFile: string,
  serviceResponse: { list: any[] }
): EnvironmentSnapshot {
  const variables = parseEnvFile(envFile);

  const environmentType =
    variables.envType?.value ??
    variables.ENV_TYPE?.value ??
    undefined;

  const services = (serviceResponse.list ?? [])
    .filter((stack) => stack.isSystem !== true)
    .map((stack) => ({
      id: stack.id,
      name: stack.name,
      status: stack.status,
      isSystem: false,
      runtime: {
        type: stack.serviceStackTypeInfo?.serviceStackTypeName ?? "",
        category: stack.serviceStackTypeInfo?.serviceStackTypeCategory ?? "",
        versionName:
          stack.serviceStackTypeInfo?.serviceStackTypeVersionName ?? "",
        versionId: stack.serviceStackTypeVersionId ?? "",
        base: stack.base ?? "",
        versionNumber: stack.versionNumber ?? ""
      },
      startup: {
        startOnProjectStart: Boolean(stack.startOnProjectStart)
      },
      resources: resourceConfig(stack.currentAutoscaling?.verticalAutoscaling),
      autoscaling: autoscalingConfig(stack),
      networking: {
        ports: stack.ports ?? [],
        requestedPorts: stack.requestedPorts ?? {
          isActive: false,
          requestedPorts: []
        },
        customPortsEnabled: stack.customPortsEnabled,
        subdomainAccess: stack.subdomainAccess
      }
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    project: {
      id: project.id,
      clientId: project.clientId,
      name: project.name,
      mode: project.mode,
      status: project.status,
      autoStartup: Boolean(project.autoStartup),
      location: project.primaryInstanceLocation
        ? {
            id: project.primaryInstanceLocation.id,
            name: project.primaryInstanceLocation.name
          }
        : undefined
    },
    environment: { type: environmentType },
    variables,
    services
  };
}
