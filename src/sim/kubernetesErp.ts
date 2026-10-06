/**
 * The one-click three-tier ERP system, built on a simulated GKE cluster.
 *
 * This is the Kubernetes counterpart to `referenceArchitecture.ts`. Where that
 * builder wires VMs together by hand with instance groups and load balancers,
 * this one deploys real Kubernetes objects: three Deployments of three replicas
 * each, Services with label selectors, an Ingress, a Gateway that provisions a
 * load balancer in the VPC, autoscalers, a ConfigMap, a Secret and a claim.
 *
 * ```
 *   internet -> gateway (L7 external LB) -> ingress erp-web
 *                -> service erp-web-svc (3 pods, :8080)
 *                   -> service erp-api-svc (3 pods, :8080)
 *                      -> service erp-db-svc  (3 pods, :5432, PVC)
 * ```
 *
 * Because every pod is selected by label rather than by name, scaling a tier
 * automatically widens its Service's endpoint set. That is the point: it is what
 * makes the topology behave like Kubernetes rather than look like it.
 */

import {
  addRule,
  attachInternetGateway,
  attachNsg,
  createInitialState,
  createLoadBalancer,
  createNsg,
  createSubnet,
  createVpc,
} from './engine';
import {
  createK8sAutoscaler,
  createK8sCluster,
  createK8sConfigMap,
  createK8sDeployment,
  createK8sGateway,
  createK8sIngress,
  createK8sNamespace,
  createK8sPvc,
  createK8sSecret,
  createK8sService,
  deleteK8sCluster,
  reconcileK8sAutoscaler,
  resizeK8sCluster,
  scaleK8sDeployment,
  selectorMatches,
  serviceEndpoints,
} from './k8s';
import {
  K8sAutoscaler,
  K8sCluster,
  K8sDeployment,
  K8sGateway,
  K8sIngress,
  K8sNamespace,
  K8sPersistentVolumeClaim,
  K8sService,
  Rule,
  SimResult,
  SimState,
  ok,
} from './types';

/** Runs one builder step, failing loudly so a broken plan is never half-applied. */
function step<T extends { state: SimState }>(state: SimState, label: string, result: SimResult<T>): SimState {
  if (!result.ok) {
    throw new Error(`Kubernetes ERP step "${label}" failed: ${result.message}`);
  }
  return result.value.state;
}

function rule(partial: Omit<Rule, 'id' | 'nsgId' | 'destCidr'> & { destCidr?: string }): Omit<Rule, 'id' | 'nsgId'> {
  return { destCidr: '0.0.0.0/0', ...partial };
}

export interface KubernetesErpOptions {
  region?: string;
  /** Cluster name. Must be a valid GCP resource name. */
  clusterName?: string;
  /** Nodes in the node pool. */
  nodeCount?: number;
  /** Replicas per tier. The brief calls for three. */
  replicas?: number;
  /** Machine type for the cluster nodes. */
  machineType?: string;
  /** Kubernetes version, e.g. 1.31.0-gke.1002000. */
  version?: string;
}

export interface KubernetesErpArchitecture {
  state: SimState;
  cluster: K8sCluster;
  namespace: K8sNamespace;
  /** Web, API and database tiers, in traffic order. */
  web: K8sDeployment;
  api: K8sDeployment;
  db: K8sDeployment;
  webService: K8sService;
  apiService: K8sService;
  dbService: K8sService;
  gateway: K8sGateway;
  ingress: K8sIngress;
  pvc: K8sPersistentVolumeClaim;
  autoscalers: K8sAutoscaler[];
  /** Public address of the gateway's load balancer. */
  externalAddress: string;
  /** Internal address of the regional gateway frontend. */
  internalAddress: string;
}

/**
 * Build a complete three-tier ERP on a new GKE cluster.
 *
 * The plan is:
 *  1. VPC plus public and cluster subnets.
 *  2. Per-tier firewall policies so only the intended paths are open.
 *  3. A GKE cluster whose nodes are real VMs in the cluster subnet.
 *  4. Three Deployments of three replicas each, selected by label.
 *  5. A ClusterIP Service per tier, an Ingress for the web tier, and an
 *     external Gateway that provisions a real load balancer.
 *  6. A regional internal gateway so the database tier is reachable in-VPC.
 *  7. Autoscalers, a ConfigMap, a Secret and a claim for the database.
 *
 * `webSize`/`apiSize` from the VM-based builder are deliberately not reused:
 * here the equivalent knob is `replicas`, and the autoscaler bounds govern it.
 */
export function buildKubernetesErp(options: KubernetesErpOptions = {}): KubernetesErpArchitecture {
  const region = options.region ?? 'us-central1';
  const clusterName = options.clusterName ?? 'erp-gke';
  const replicas = Math.max(1, Math.min(20, Math.trunc(options.replicas ?? 3)));
  const nodeCount = Math.max(1, Math.min(50, Math.trunc(options.nodeCount ?? 3)));

  let s = createInitialState();

  /* ---------------- network foundation ---------------- */

  s = step(s, 'create VPC', createVpc(s, { name: 'erp-k8s-vpc' }));
  const vpcId = s.vpcs[0].id;

  // The web tier is in a public-range subnet so the gateway can reach it; the
  // cluster and data tiers stay on private ranges.
  s = step(
    s,
    'create public subnet',
    createSubnet(s, { name: 'erp-public', vpcId, cidr: '10.20.1.0/24', region, allowPublicRange: true })
  );
  s = step(s, 'create data subnet', createSubnet(s, { name: 'erp-data', vpcId, cidr: '10.20.3.0/24', region }));

  const publicSubnet = s.subnets.find((x) => x.name === 'erp-public')!;
  const dataSubnet = s.subnets.find((x) => x.name === 'erp-data')!;

  // Public egress for the web tier's outbound calls.
  s = step(s, 'attach internet gateway', attachInternetGateway(s, { name: 'erp-k8s-igw', vpcId }));

  /* ---------------- tier firewall policies ---------------- */

  const policySpecs: { name: string; subnetId: string; rules: Omit<Rule, 'id' | 'nsgId'>[] }[] = [
    {
      name: 'erp-web-policy',
      subnetId: publicSubnet.id,
      rules: [
        rule({ name: 'allow-http', direction: 'ingress', action: 'allow', priority: 1000, protocol: 'tcp', portRange: '8080', sourceCidr: '0.0.0.0/0', description: 'Gateway traffic to the web tier.' }),
        rule({ name: 'deny-rest', direction: 'ingress', action: 'deny', priority: 65000, protocol: 'all', portRange: 'all', sourceCidr: '0.0.0.0/0', description: 'Implicit deny on the web tier.' }),
      ],
    },
    {
      name: 'erp-data-policy',
      subnetId: dataSubnet.id,
      rules: [
        rule({ name: 'allow-postgres-from-app', direction: 'ingress', action: 'allow', priority: 1000, protocol: 'tcp', portRange: '5432', sourceCidr: '10.128.0.0/9', description: 'PostgreSQL from the cluster node range only.' }),
        rule({ name: 'deny-rest', direction: 'ingress', action: 'deny', priority: 65000, protocol: 'all', portRange: 'all', sourceCidr: '0.0.0.0/0', description: 'The data tier is never exposed.' }),
      ],
    },
  ];

  for (const spec of policySpecs) {
    const created = createNsg(s, { name: spec.name, vpcId });
    s = step(s, `create policy ${spec.name}`, created);
    const nsgId = created.ok ? created.value.nsg.id : '';
    s = step(s, `attach policy ${spec.name}`, attachNsg(s, nsgId, { subnetIds: [spec.subnetId] }));
    for (const r of spec.rules) {
      s = step(s, `add rule ${r.name}`, addRule(s, nsgId, r));
    }
  }

  /* ---------------- cluster ---------------- */

  // Nodes go on the public subnet so the external gateway can health-check
  // them; the web tier pods ride the same nodes, which is how a GKE cluster
  // behaves when you enable a public address.
  const clusterResult = createK8sCluster(s, {
    name: clusterName,
    vpcId,
    subnetId: publicSubnet.id,
    region,
    machineType: options.machineType ?? 'e2-standard-4',
    version: options.version ?? '1.31.0-gke.1002000',
    nodeCount,
    minNodeCount: 1,
    maxNodeCount: Math.max(3, nodeCount * 3),
  });
  s = step(s, 'create cluster', clusterResult);
  const cluster = clusterResult.ok ? clusterResult.value.cluster : ({} as K8sCluster);

  /* ---------------- namespace and configuration ---------------- */

  const namespaceResult = createK8sNamespace(s, { name: 'erp', clusterId: cluster.id, labels: { app: 'erp' } });
  s = step(s, 'create namespace', namespaceResult);
  const namespace = namespaceResult.ok ? namespaceResult.value.namespace : ({} as K8sNamespace);

  const configMapResult = createK8sConfigMap(s, {
    name: 'erp-config',
    namespaceId: namespace.id,
    data: {
      LOG_LEVEL: 'info',
      ERP_TIER: 'three',
      DB_HOST: 'erp-db-svc.erp.svc.cluster.local',
      DB_PORT: '5432',
    },
  });
  s = step(s, 'create config map', configMapResult);

  // Simulated credentials only; the base64 values are what Kubernetes stores
  // and are never a real credential anywhere.
  const secretResult = createK8sSecret(s, {
    name: 'erp-db',
    namespaceId: namespace.id,
    data: { DB_USER: 'erp_app', DB_PASSWORD: 'localcloud-simulated-only' },
  });
  s = step(s, 'create secret', secretResult);

  const pvcResult = createK8sPvc(s, { name: 'erp-db-data', namespaceId: namespace.id, storageGb: 100, accessMode: 'ReadWriteOnce' });
  s = step(s, 'create persistent volume claim', pvcResult);
  const pvc = pvcResult.ok ? pvcResult.value.pvc : ({} as K8sPersistentVolumeClaim);

  /* ---------------- three tiers, three replicas each ---------------- */

  // Label keys are what tie deployments to services; keeping them explicit is
  // the whole point of the selector-based model.
  const webDeploy = createK8sDeployment(s, {
    name: 'erp-web',
    namespaceId: namespace.id,
    replicas,
    image: 'gcr.io/localcloud/erp-web:v1',
    containerPort: 8080,
    labels: { app: 'erp-web', tier: 'web' },
    env: { LOG_LEVEL: 'info', UPSTREAM: 'erp-api-svc.erp.svc.cluster.local:8080' },
  });
  s = step(s, 'create web deployment', webDeploy);

  const apiDeploy = createK8sDeployment(s, {
    name: 'erp-api',
    namespaceId: namespace.id,
    replicas,
    image: 'gcr.io/localcloud/erp-api:v1',
    containerPort: 8080,
    labels: { app: 'erp-api', tier: 'api' },
    env: { DB_HOST: 'erp-db-svc.erp.svc.cluster.local', DB_PORT: '5432' },
  });
  s = step(s, 'create api deployment', apiDeploy);

  const dbDeploy = createK8sDeployment(s, {
    name: 'erp-db',
    namespaceId: namespace.id,
    replicas,
    image: 'gcr.io/localcloud/erp-db:v1',
    containerPort: 5432,
    labels: { app: 'erp-db', tier: 'db' },
    env: { POSTGRES_DB: 'erp', POSTGRES_USER: 'erp_app' },
    pvcId: pvc.id,
  });
  s = step(s, 'create db deployment', dbDeploy);

  const web = webDeploy.ok ? webDeploy.value.deployment : ({} as K8sDeployment);
  const api = apiDeploy.ok ? apiDeploy.value.deployment : ({} as K8sDeployment);
  const db = dbDeploy.ok ? dbDeploy.value.deployment : ({} as K8sDeployment);

  /* ---------------- services ---------------- */

  // ClusterIP services: in-cluster DNS names, no public exposure. The api tier
  // reaches the db tier through its ClusterIP, so the data path is the service
  // network rather than pod IPs.
  const webService = createK8sService(s, {
    name: 'erp-web-svc',
    namespaceId: namespace.id,
    selector: { app: 'erp-web' },
    port: 80,
    targetPort: 8080,
  });
  s = step(s, 'create web service', webService);

  const apiService = createK8sService(s, {
    name: 'erp-api-svc',
    namespaceId: namespace.id,
    selector: { app: 'erp-api' },
    port: 8080,
    targetPort: 8080,
  });
  s = step(s, 'create api service', apiService);

  const dbService = createK8sService(s, {
    name: 'erp-db-svc',
    namespaceId: namespace.id,
    selector: { app: 'erp-db' },
    port: 5432,
    targetPort: 5432,
  });
  s = step(s, 'create db service', dbService);

  const webSvc = webService.ok ? webService.value.service : ({} as K8sService);
  const apiSvc = apiService.ok ? apiService.value.service : ({} as K8sService);
  const dbSvc = dbService.ok ? dbService.value.service : ({} as K8sService);

  /* ---------------- ingress and gateways ---------------- */

  const ingressResult = createK8sIngress(s, {
    name: 'erp-web-ingress',
    namespaceId: namespace.id,
    host: 'erp.example.internal',
    path: '/',
    serviceId: webSvc.id,
    servicePort: 80,
  });
  s = step(s, 'create ingress', ingressResult);
  const ingress = ingressResult.ok ? ingressResult.value.ingress : ({} as K8sIngress);

  // External gateway: provisions a real external load balancer in the VPC.
  const gatewayResult = createK8sGateway(s, {
    name: 'erp-external-gateway',
    namespaceId: namespace.id,
    className: 'gke-l7-global-external',
    serviceId: webSvc.id,
    port: 80,
  });
  s = step(s, 'create external gateway', gatewayResult);
  const gateway = gatewayResult.ok ? gatewayResult.value.gateway : ({} as K8sGateway);

  // Regional internal gateway: an internal frontend so in-VPC clients can reach
  // the API tier without leaving the network.
  const internalResult = createK8sGateway(s, {
    name: 'erp-internal-gateway',
    namespaceId: namespace.id,
    className: 'gke-l7-regional-internal-external',
    serviceId: apiSvc.id,
    port: 8080,
  });
  s = step(s, 'create internal gateway', internalResult);
  const internalGateway = internalResult.ok ? internalResult.value.gateway : ({} as K8sGateway);

  // The internal gateway needs an internal frontend too, which is a separate
  // load balancer in the VPC.
  let internalAddress = internalGateway.address ?? '';
  if (internalResult.ok) {
    const internalLb = createLoadBalancer(s, {
      name: 'erp-internal-gateway-ilb',
      type: 'internal-tcp',
      vpcId,
      port: 8080,
      protocol: 'tcp',
      backendVmIds: cluster.vmIds,
      healthCheckPort: 8080,
    });
    if (internalLb.ok) {
      s = internalLb.value.state;
      internalAddress = internalLb.value.lb.frontendIp;
      // Track the internal frontend on the gateway so cluster teardown reclaims it.
      s = {
        ...s,
        k8sGateways: s.k8sGateways.map((g) =>
          g.id === internalGateway.id ? { ...g, internalLbId: internalLb.value.lb.id } : g
        ),
      };
      // Let the nodes accept health checks from the internal frontend.
      const nsgId = s.nsgs.find((n) => n.name === `${cluster.name}-nodes`)?.id;
      if (nsgId) {
        const hc = addRule(s, nsgId, rule({
          name: 'allow-hc-internal-gateway',
          direction: 'ingress',
          action: 'allow',
          priority: 1060,
          protocol: 'tcp',
          portRange: '8080',
          sourceCidr: `${internalLb.value.lb.frontendIp}/32`,
          description: 'Health check for the internal gateway.',
        }));
        if (hc.ok) s = hc.value.state;
      }
    }
  }

  /* ---------------- autoscalers ---------------- */

  // Autoscalers demonstrate that the replica count is not fixed: reconcile
  // runs one decision against each tier. Created sequentially, because each
  // call folds its result into the state the next one builds on.
  //
  // Bounds follow the requested replica count: the floor is the size the system
  // was built at, so a custom build never starts outside its own range.
  const autoscalerIds: string[] = [];
  for (const spec of [
    { name: 'erp-web-hpa', deploymentId: web.id, target: 70 },
    { name: 'erp-api-hpa', deploymentId: api.id, target: 70 },
    { name: 'erp-db-hpa', deploymentId: db.id, target: 75 },
  ]) {
    const created = createK8sAutoscaler(s, {
      name: spec.name,
      namespaceId: namespace.id,
      deploymentId: spec.deploymentId,
      minReplicas: replicas,
      maxReplicas: replicas + 5,
      targetCpuUtilization: spec.target,
    });
    s = step(s, `create autoscaler ${spec.name}`, created);
    if (created.ok) autoscalerIds.push(created.value.autoscaler.id);
  }

  return {
    state: s,
    cluster,
    namespace,
    web,
    api,
    db,
    webService: webSvc,
    apiService: apiSvc,
    dbService: dbSvc,
    gateway,
    ingress,
    pvc,
    autoscalers: s.k8sAutoscalers,
    externalAddress: gateway.address ?? '',
    internalAddress,
  };
}

/**
 * Scale a tier and keep everything downstream consistent.
 *
 * Scaling a deployment widens its service's endpoint set automatically (selectors
 * are label-based), but the gateway's load balancer still needs its health
 * check rule and node backends verified, so we resync it here. This is the one
 * place that coupling lives, so the console button and the tests cannot drift.
 */
export function scaleErpTier(
  state: SimState,
  deploymentId: string,
  replicas: number
): SimResult<{ state: SimState; deployment: K8sDeployment; endpoints: number }> {
  const deployment = state.k8sDeployments.find((d) => d.id === deploymentId);
  if (!deployment) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Deployment was not found.',
      howToFix: 'It may have been deleted already. Refresh the list and try again.',
    };
  }

  const scaled = scaleK8sDeployment(state, deploymentId, replicas);
  if (!scaled.ok) return scaled;

  let next = scaled.value.state;

  // Gateway and LoadBalancer services target the node pool; resync after a
  // scale so a resized cluster keeps serving.
  for (const gateway of next.k8sGateways.filter((g) => g.clusterId === deployment.clusterId)) {
    const lbIds = [gateway.lbId, gateway.internalLbId].filter((id): id is string => Boolean(id));
    if (lbIds.length === 0) continue;
    const nodes = next.k8sClusters.find((c) => c.id === deployment.clusterId)?.vmIds ?? [];
    next = {
      ...next,
      loadBalancers: next.loadBalancers.map((l) =>
        lbIds.includes(l.id) && l.backendVmIds.length !== nodes.length
          ? { ...l, backendVmIds: nodes }
          : l
      ),
    };
  }

  const service = next.k8sServices.find(
    (s) => s.clusterId === deployment.clusterId && selectorMatches(s.selector, deployment.labels)
  );
  const endpoints = service ? serviceEndpoints(next, service).length : 0;

  return ok(
    { state: next, deployment: scaled.value.deployment, endpoints },
    `Scaled "${deployment.name}" to ${scaled.value.deployment.replicas} replica(s); its service now has ${endpoints} endpoint(s).`
  );
}

/**
 * Load-test the ERP: drive each autoscaler as if CPU spiked, so the console can
 * show the whole system scaling out and back in.
 */
export function loadTestErp(
  state: SimState,
  targetCpu = 92
): SimResult<{ state: SimState; scaled: boolean; details: string[] }> {
  let next = state;
  const details: string[] = [];
  let scaled = false;

  // Run the three tier autoscalers in a fixed order so the result is
  // deterministic for tests.
  for (const autoscaler of next.k8sAutoscalers) {
    const primed: SimState = {
      ...next,
      k8sAutoscalers: next.k8sAutoscalers.map((a) =>
        a.id === autoscaler.id ? { ...a, currentCpuUtilization: targetCpu } : a
      ),
    };
    const result = reconcileK8sAutoscaler(primed, autoscaler.id);
    if (result.ok) {
      next = result.value.state;
      scaled = scaled || result.value.scaled;
      details.push(result.message);
    }
  }

  return ok(
    { state: next, scaled, details },
    scaled ? `Load test scaled the ERP out: ${details.length} autoscaler(s) acted.` : 'Load test did not trigger a scale event.'
  );
}

/**
 * Re-point every load balancer that fronts the cluster at the current nodes.
 *
 * Used after a manual node-pool resize from the console so the traffic path
 * stays correct without the caller having to know which resources changed.
 */
export function resyncClusterLoadBalancers(
  state: SimState,
  clusterId: string
): SimResult<{ state: SimState; updated: number }> {
  const cluster = state.k8sClusters.find((c) => c.id === clusterId);
  if (!cluster) {
    return { ok: false, code: 'NOT_FOUND', message: 'Kubernetes cluster was not found.', howToFix: 'It may have been deleted already.' };
  }
  const nodes = cluster.vmIds;
  let updated = 0;

  const next: SimState = {
    ...state,
    loadBalancers: state.loadBalancers.map((lb) => {
      const owned =
        state.k8sGateways.some(
          (g) => (g.lbId === lb.id || g.internalLbId === lb.id) && g.clusterId === clusterId
        ) ||
        state.k8sServices.some((s) => s.lbId === lb.id && s.clusterId === clusterId);
      if (!owned) return lb;
      if (lb.backendVmIds.length === nodes.length && nodes.every((id) => lb.backendVmIds.includes(id))) return lb;
      updated += 1;
      return { ...lb, backendVmIds: nodes };
    }),
  };

  return ok({ state: next, updated }, updated ? `Resynced ${updated} load balancer(s) to ${nodes.length} node(s).` : 'Load balancers are already in sync.');
}

/** Scale the node pool and resync the load balancers that depend on it. */
export function resizeErpCluster(
  state: SimState,
  clusterId: string,
  nodeCount: number
): SimResult<{ state: SimState; cluster: K8sCluster; updatedLoadBalancers: number }> {
  const resized = resizeK8sCluster(state, clusterId, nodeCount);
  if (!resized.ok) {
    return { ok: false, code: resized.code, message: resized.message, howToFix: resized.howToFix };
  }
  const resynced = resyncClusterLoadBalancers(resized.value.state, clusterId);
  if (!resynced.ok) {
    return { ok: false, code: resynced.code, message: resynced.message, howToFix: resynced.howToFix };
  }
  return ok(
    { state: resynced.value.state, cluster: resized.value.cluster, updatedLoadBalancers: resynced.value.updated },
    `${resized.message} ${resynced.message}`
  );
}

/** Remove every cluster and its workloads, leaving the VPC alone. */
export function removeAllClusters(state: SimState): SimState {
  let next = state;
  for (const cluster of [...state.k8sClusters]) {
    const removed = deleteK8sCluster(next, cluster.id, { cascade: true });
    if (removed.ok) next = removed.value.state;
  }
  return next;
}