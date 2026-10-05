/**
 * Cloud Run Emulation Service
 * Conforms to Google Cloud Run Admin API v2 / v1 specifications and Prisma models.
 * Manages container images, revisions, traffic allocations, scale-to-zero, and request proxying.
 */

export interface CloudRunEnvVarRecord {
  id: string;
  revisionId: string;
  name: string;
  value: string;
}

export interface CloudRunTrafficTargetRecord {
  id: string;
  serviceId: string;
  revisionId?: string;
  revisionName: string;
  percent: number;
  latestRevision: boolean;
  tag?: string;
}

export interface CloudRunRevisionRecord {
  id: string;
  serviceId: string;
  name: string; // e.g. hello-service-00001-abc
  image: string; // Container image URI e.g. gcr.io/google-samples/hello-app:1.0
  sourceType: 'IMAGE' | 'NODE' | 'PYTHON';
  sourceCode?: string;
  cpu: string;
  memory: string;
  minInstances: number;
  maxInstances: number;
  concurrency: number;
  timeoutSeconds: number;
  port: number;
  status: 'Ready' | 'Progressing' | 'Failed';
  trafficPercent: number;
  activeInstances: number;
  author: string;
  createdAt: string;
  envVars: CloudRunEnvVarRecord[];
}

export interface CloudRunServiceRecord {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  region: string;
  url: string;
  status: 'READY' | 'DEPLOYING' | 'FAILED';
  activeInstances: number;
  allowUnauthenticated: boolean;
  ingress: 'all' | 'internal' | 'internal-and-cloud-load-balancing';
  latestCreatedRevision?: string;
  latestReadyRevision?: string;
  creator: string;
  createdAt: string;
  updatedAt: string;
  revisions: CloudRunRevisionRecord[];
  traffic: CloudRunTrafficTargetRecord[];
}

export interface DeployContainerImageInput {
  projectId?: string;
  name: string;
  image: string; // Container image URI
  region?: string;
  description?: string;
  cpu?: string;
  memory?: string;
  minInstances?: number;
  maxInstances?: number;
  concurrency?: number;
  timeoutSeconds?: number;
  port?: number;
  envVars?: Record<string, string>;
  allowUnauthenticated?: boolean;
  ingress?: 'all' | 'internal' | 'internal-and-cloud-load-balancing';
  sourceType?: 'IMAGE' | 'NODE' | 'PYTHON';
  sourceCode?: string;
  revisionTag?: string;
}

export interface UpdateTrafficInput {
  targets: Array<{
    revisionName: string;
    percent: number;
    tag?: string;
  }>;
}

export class CloudRunEmulationService {
  private services: Map<string, CloudRunServiceRecord> = new Map();

  constructor() {
    this.seedDefaultServices();
  }

  /**
   * Seed realistic default services conforming to Google Cloud Run standards
   */
  private seedDefaultServices(): void {
    const defaultProjectId = 'optical-order-460008-i6';
    const helloServiceId = 'run-service-hello-01';
    const helloRevName = 'hello-service-00001-xyz';

    const helloRevision: CloudRunRevisionRecord = {
      id: 'rev-hello-001',
      serviceId: helloServiceId,
      name: helloRevName,
      image: 'gcr.io/google-samples/hello-app:1.0',
      sourceType: 'IMAGE',
      cpu: '1',
      memory: '512Mi',
      minInstances: 0,
      maxInstances: 100,
      concurrency: 80,
      timeoutSeconds: 300,
      port: 8080,
      status: 'Ready',
      trafficPercent: 100,
      activeInstances: 1,
      author: 'student@localcloud.dev',
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      envVars: [
        { id: 'env-1', revisionId: 'rev-hello-001', name: 'PORT', value: '8080' },
        { id: 'env-2', revisionId: 'rev-hello-001', name: 'TARGET', value: 'LocalCloud' },
      ],
    };

    const helloTraffic: CloudRunTrafficTargetRecord = {
      id: 'traffic-hello-01',
      serviceId: helloServiceId,
      revisionId: helloRevision.id,
      revisionName: helloRevName,
      percent: 100,
      latestRevision: true,
    };

    const helloService: CloudRunServiceRecord = {
      id: helloServiceId,
      projectId: defaultProjectId,
      name: 'hello-service',
      description: 'Default sample container application deployed on Cloud Run',
      region: 'us-central1',
      url: 'https://hello-service-460008-uc.a.run.app',
      status: 'READY',
      activeInstances: 1,
      allowUnauthenticated: true,
      ingress: 'all',
      latestCreatedRevision: helloRevName,
      latestReadyRevision: helloRevName,
      creator: 'student@localcloud.dev',
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      revisions: [helloRevision],
      traffic: [helloTraffic],
    };

    this.services.set(helloService.name.toLowerCase(), helloService);
  }

  /**
   * List all services for a project and optional region
   */
  public listServices(projectId?: string, region?: string): CloudRunServiceRecord[] {
    let list = Array.from(this.services.values());
    if (projectId) {
      list = list.filter(s => s.projectId === projectId);
    }
    if (region) {
      list = list.filter(s => s.region === region);
    }
    return list;
  }

  /**
   * Get service by name or ID
   */
  public getService(nameOrId: string, projectId?: string): CloudRunServiceRecord | null {
    const normalized = nameOrId.toLowerCase();
    const service = this.services.get(normalized) ||
      Array.from(this.services.values()).find(s => s.id === nameOrId);

    if (service && projectId && service.projectId !== projectId) {
      return null;
    }
    return service || null;
  }

  /**
   * Deploy a container image or update an existing service with a new revision
   */
  public deployService(input: DeployContainerImageInput): CloudRunServiceRecord {
    const sName = input.name.trim().toLowerCase();
    const projectId = input.projectId || 'optical-order-460008-i6';
    const region = input.region || 'us-central1';
    const existing = this.services.get(sName);

    // Calculate sequential revision name
    const revIndex = existing ? existing.revisions.length + 1 : 1;
    const revIndexPad = String(revIndex).padStart(5, '0');
    const randomHash = Math.random().toString(36).substring(2, 6);
    const revisionName = `${sName}-${revIndexPad}-${randomHash}`;
    const revisionId = `rev-${Date.now()}-${randomHash}`;

    // Normalize image
    const imageUri = input.image.trim() || 'gcr.io/google-samples/hello-app:1.0';

    // Prepare environment variables
    const envVarsList: CloudRunEnvVarRecord[] = Object.entries(input.envVars || {
      PORT: String(input.port || 8080),
      NODE_ENV: 'production',
    }).map(([name, value], i) => ({
      id: `env-${Date.now()}-${i}`,
      revisionId,
      name,
      value,
    }));

    const newRevision: CloudRunRevisionRecord = {
      id: revisionId,
      serviceId: existing ? existing.id : `run-${Date.now()}`,
      name: revisionName,
      image: imageUri,
      sourceType: input.sourceType || 'IMAGE',
      sourceCode: input.sourceCode,
      cpu: input.cpu || '1',
      memory: input.memory || '512Mi',
      minInstances: input.minInstances ?? 0,
      maxInstances: input.maxInstances ?? 100,
      concurrency: input.concurrency ?? 80,
      timeoutSeconds: input.timeoutSeconds ?? 300,
      port: input.port ?? 8080,
      status: 'Ready',
      trafficPercent: 100,
      activeInstances: (input.minInstances ?? 0) > 0 ? (input.minInstances ?? 0) : 1,
      author: 'student@localcloud.dev',
      createdAt: new Date().toISOString(),
      envVars: envVarsList,
    };

    if (existing) {
      // Re-allocate traffic: new revision gets 100% unless specified, previous revisions get 0%
      const updatedTraffic: CloudRunTrafficTargetRecord[] = [
        {
          id: `traffic-${Date.now()}`,
          serviceId: existing.id,
          revisionId: newRevision.id,
          revisionName: newRevision.name,
          percent: 100,
          latestRevision: true,
          tag: input.revisionTag,
        },
      ];

      // Mark older revisions
      const updatedRevisions = [
        newRevision,
        ...existing.revisions.map(r => ({ ...r, trafficPercent: 0, activeInstances: 0 })),
      ];

      existing.latestCreatedRevision = newRevision.name;
      existing.latestReadyRevision = newRevision.name;
      existing.activeInstances = newRevision.activeInstances;
      existing.updatedAt = new Date().toISOString();
      existing.revisions = updatedRevisions;
      existing.traffic = updatedTraffic;
      if (input.allowUnauthenticated !== undefined) {
        existing.allowUnauthenticated = input.allowUnauthenticated;
      }
      if (input.description) {
        existing.description = input.description;
      }

      this.services.set(sName, existing);
      return existing;
    }

    // New service creation
    const serviceId = newRevision.serviceId;
    const regionCode = region.replace(/[^a-z0-9]/g, '').slice(0, 2);
    const serviceUrl = `https://${sName}-460008-${regionCode}.a.run.app`;

    const serviceRecord: CloudRunServiceRecord = {
      id: serviceId,
      projectId,
      name: sName,
      description: input.description || `Cloud Run container service: ${imageUri}`,
      region,
      url: serviceUrl,
      status: 'READY',
      activeInstances: newRevision.activeInstances,
      allowUnauthenticated: input.allowUnauthenticated ?? true,
      ingress: input.ingress || 'all',
      latestCreatedRevision: newRevision.name,
      latestReadyRevision: newRevision.name,
      creator: 'student@localcloud.dev',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revisions: [newRevision],
      traffic: [
        {
          id: `traffic-${Date.now()}`,
          serviceId,
          revisionId: newRevision.id,
          revisionName: newRevision.name,
          percent: 100,
          latestRevision: true,
          tag: input.revisionTag,
        },
      ],
    };

    this.services.set(sName, serviceRecord);
    return serviceRecord;
  }

  /**
   * Delete a service
   */
  public deleteService(nameOrId: string, projectId?: string): boolean {
    const service = this.getService(nameOrId, projectId);
    if (!service) return false;
    return this.services.delete(service.name.toLowerCase());
  }

  /**
   * List revisions for a service
   */
  public listRevisions(nameOrId: string): CloudRunRevisionRecord[] {
    const service = this.getService(nameOrId);
    if (!service) return [];
    return service.revisions;
  }

  /**
   * Get specific revision
   */
  public getRevision(nameOrId: string, revisionName: string): CloudRunRevisionRecord | null {
    const service = this.getService(nameOrId);
    if (!service) return null;
    return service.revisions.find(r => r.name === revisionName) || null;
  }

  /**
   * Update traffic allocation across revisions (split / canary / rollback)
   */
  public updateTraffic(nameOrId: string, input: UpdateTrafficInput): CloudRunServiceRecord | null {
    const service = this.getService(nameOrId);
    if (!service) return null;

    // Validate that percentages sum to 100
    const totalPercent = input.targets.reduce((acc, t) => acc + t.percent, 0);
    if (totalPercent !== 100) {
      throw new Error(`Total traffic percentage must equal 100%. Received: ${totalPercent}%`);
    }

    const newTargets: CloudRunTrafficTargetRecord[] = [];
    for (const t of input.targets) {
      const rev = service.revisions.find(r => r.name === t.revisionName);
      newTargets.push({
        id: `traffic-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        serviceId: service.id,
        revisionId: rev ? rev.id : undefined,
        revisionName: t.revisionName,
        percent: t.percent,
        latestRevision: t.revisionName === service.latestReadyRevision,
        tag: t.tag,
      });
    }

    // Update traffic percent on revisions
    service.revisions = service.revisions.map(r => {
      const target = input.targets.find(t => t.revisionName === r.name);
      const percent = target ? target.percent : 0;
      return {
        ...r,
        trafficPercent: percent,
        activeInstances: percent > 0 ? Math.max(1, r.activeInstances) : 0,
      };
    });

    service.traffic = newTargets;
    service.updatedAt = new Date().toISOString();
    return service;
  }

  /**
   * Rollback service traffic 100% to a specified revision
   */
  public rollbackRevision(nameOrId: string, targetRevisionName: string): CloudRunServiceRecord | null {
    return this.updateTraffic(nameOrId, {
      targets: [{ revisionName: targetRevisionName, percent: 100 }],
    });
  }

  /**
   * Delete a specific revision
   */
  public deleteRevision(nameOrId: string, revisionName: string): boolean {
    const service = this.getService(nameOrId);
    if (!service) return false;

    // Cannot delete active revision receiving traffic
    const isReceivingTraffic = service.traffic.some(t => t.revisionName === revisionName && t.percent > 0);
    if (isReceivingTraffic) {
      throw new Error(`Cannot delete revision "${revisionName}" because it is currently allocated traffic.`);
    }

    const prevCount = service.revisions.length;
    service.revisions = service.revisions.filter(r => r.name !== revisionName);
    service.updatedAt = new Date().toISOString();
    return service.revisions.length < prevCount;
  }

  /**
   * Execute an invocation against the Cloud Run service emulating Google Frontend routing
   */
  public async invokeService(
    serviceName: string,
    subpath = '/',
    method = 'GET',
    headers: Record<string, string> = {},
    body?: any
  ): Promise<{
    statusCode: number;
    headers: Record<string, string>;
    data: any;
    latencyMs: number;
  }> {
    const service = this.getService(serviceName);
    const start = Date.now();
    const traceId = Math.random().toString(36).substring(2, 16);

    // If service doesn't exist, return 404
    if (!service) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Server': 'Google Frontend (LocalCloud Cloud Run Emulator)',
        },
        data: {
          error: {
            code: 404,
            message: `The requested service "${serviceName}" was not found on LocalCloud.`,
            status: 'NOT_FOUND',
          },
        },
        latencyMs: 15,
      };
    }

    // Determine target revision based on traffic allocation
    const primaryTarget = service.traffic.find(t => t.percent > 0) || service.traffic[0];
    const targetRev = service.revisions.find(r => r.name === primaryTarget?.revisionName) || service.revisions[0];

    // Scale from zero emulation
    const coldStartDelay = service.activeInstances === 0 ? 120 : 25;
    await new Promise(r => setTimeout(r, coldStartDelay + Math.random() * 30));
    const latencyMs = Date.now() - start;

    // Increment active instance count on invocation
    service.activeInstances = Math.max(1, service.activeInstances);
    if (targetRev) {
      targetRev.activeInstances = Math.max(1, targetRev.activeInstances);
    }

    const normalizedPath = subpath.startsWith('/') ? subpath : `/${subpath}`;
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Server': 'Google Frontend (LocalCloud Cloud Run Emulator)',
      'X-Cloud-Trace-Context': `${traceId}/1;o=1`,
      'X-LocalCloud-Service': service.name,
      'X-LocalCloud-Revision': targetRev?.name || 'unknown',
      'X-LocalCloud-Container-Image': targetRev?.image || 'unknown',
      'X-LocalCloud-Scale-Status': 'scaled-from-zero (active instances: 1)',
    };

    if (normalizedPath === '/healthz' || normalizedPath === '/health') {
      responseHeaders['Content-Type'] = 'text/plain; charset=utf-8';
      return {
        statusCode: 200,
        headers: responseHeaders,
        data: 'OK',
        latencyMs,
      };
    }

    if (normalizedPath === '/echo') {
      return {
        statusCode: 200,
        headers: responseHeaders,
        data: {
          service: service.name,
          revision: targetRev?.name,
          containerImage: targetRev?.image,
          method,
          path: normalizedPath,
          receivedBody: body,
          requestHeaders: headers,
          timestamp: new Date().toISOString(),
          executionLatencyMs: latencyMs,
        },
        latencyMs,
      };
    }

    // Default container response
    return {
      statusCode: 200,
      headers: responseHeaders,
      data: {
        status: 'healthy',
        message: `Hello from container "${targetRev?.image || 'hello-app'}" on Cloud Run!`,
        service: service.name,
        revision: targetRev?.name,
        region: service.region,
        invokedEndpoint: normalizedPath,
        method,
        containerConfig: {
          image: targetRev?.image,
          cpu: targetRev?.cpu,
          memory: targetRev?.memory,
          concurrency: targetRev?.concurrency,
          port: targetRev?.port,
          environment: targetRev?.envVars.reduce((acc, curr) => ({ ...acc, [curr.name]: curr.value }), {}),
        },
        scaleToZeroConfigured: true,
        activeInstances: service.activeInstances,
        timestamp: new Date().toISOString(),
      },
      latencyMs,
    };
  }
}

export const cloudRunEmulationService = new CloudRunEmulationService();
