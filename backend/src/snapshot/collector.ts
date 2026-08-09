import { ZeropsClient } from "../zerops/client.js";
import { normalizeSnapshot } from "./normalizer.js";
import { EnvironmentSnapshot } from "../models/environment-snapshot.js";

export async function collectSnapshot(
  client: ZeropsClient,
  projectId: string
): Promise<EnvironmentSnapshot> {
  const [projects, envFile, stacks] = await Promise.all([
    client.getProjects(process.env.ZEROPS_CLIENT_ID!),
    client.getEnvFile(projectId),
    client.getServiceStacks(projectId)
  ]);

  const project = projects.list.find((item) => item.id === projectId);

  if (!project) {
    throw new Error(`Project ${projectId} was not found for this client.`);
  }

  return normalizeSnapshot(project, envFile.envFile, stacks);
}
