export class ZeropsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Zerops API ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  getProjects(clientId: string) {
    return this.request<{ list: any[]; totalCount: number }>(
      `/client/${clientId}/project`
    );
  }

  getProject(projectId: string) {
    return this.request<any>(`/project/${projectId}`);
  }

  getEnvFile(projectId: string) {
    return this.request<{ envFile: string }>(
      `/project/${projectId}/env-file?overrideEnvIsolation=no&userOnly=true`
    );
  }

  getServiceStacks(projectId: string) {
    return this.request<{ list: any[]; totalCount: number }>(
      `/project/${projectId}/service-stack`
    );
  }
}
