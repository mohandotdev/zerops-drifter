export interface EnvironmentSnapshot {
  project: ProjectSnapshot;
  environment: EnvironmentInfo;
  variables: Record<string, EnvironmentVariable>;
  services: ServiceSnapshot[];
}

export interface ProjectSnapshot {
  id: string;
  clientId: string;
  name: string;
  mode: string;
  status: string;
  autoStartup: boolean;
  location?: { id: string; name: string };
}

export interface EnvironmentInfo {
  type?: string;
}

export interface EnvironmentVariable {
  name: string;
  value?: string;
  configured: boolean;
  sensitive?: boolean;
}

export interface ServiceSnapshot {
  id: string;
  name: string;
  status: string;
  isSystem: boolean;
  runtime: RuntimeConfig;
  startup: StartupConfig;
  resources: ResourceConfig;
  autoscaling: AutoscalingConfig;
  networking: NetworkingConfig;
}

export interface RuntimeConfig {
  type: string;
  category: string;
  versionName: string;
  versionId: string;
  base: string;
  versionNumber: string;
}

export interface StartupConfig {
  startOnProjectStart: boolean;
}

export interface ResourceLimits {
  cpuCoreCount?: number;
  memoryGBytes?: number;
  diskGBytes?: number;
}

export interface FreeResourceThreshold {
  cpuCoreCount?: number;
  cpuCorePercent?: number;
  memoryGBytes?: number;
  memoryPercent?: number;
}

export interface ResourceConfig {
  min?: ResourceLimits;
  max?: ResourceLimits;
  minFree?: FreeResourceThreshold;
  cpuMode?: string;
  startCpuCoreCount?: number;
  swapEnabled?: boolean;
}

export interface HorizontalAutoscaling {
  minContainerCount?: number;
  maxContainerCount?: number;
}

export interface AutoscalingConfig {
  vertical?: ResourceConfig;
  horizontal?: HorizontalAutoscaling;
  customVertical?: ResourceConfig;
  customHorizontal?: HorizontalAutoscaling;
}

export interface NetworkingConfig {
  ports?: unknown[];
  requestedPorts?: { isActive: boolean; requestedPorts: unknown[] };
  customPortsEnabled?: boolean;
  subdomainAccess?: boolean;
}
