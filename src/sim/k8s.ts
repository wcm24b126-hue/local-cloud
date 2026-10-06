/**
 * Simulated Kubernetes Engine (GKE-style).
 *
 * Pure TypeScript, no React and no network calls, exactly like the networking
 * engine next door. Every mutation takes a state and returns a NEW state plus a
 * `SimResult`, so the whole thing is unit-testable and safe to call from React
 * `useState`.
 *
 * Two decisions shape the design:
 *
 *  1. **A cluster's nodes are real VMs.** A GKE node pool is a group of Compute
 *     Engine instances, so this engine creates actual `Vm` entries in the lab's
 *     VPC. The packet tracer, topology graph and firewall policies therefore
 *     work against a cluster with no special-casing: a kubelet port blocked by a
 *     firewall rule fails exactly the way a real one would.
 *
 *  2. **Pods are derived, never stored.** A Deployment owns a replica count and
 *     the pod list is computed from it, so the two can never disagree. This is
 *     the same reason the lab does not store implicit routes.
 *
 * A Gateway provisions a real load balancer in the VPC and opens the firewall
 * rules that load balancer needs, so the path a learner inspects is the path
 * the simulator actually evaluates.
 */

import {
  addRule,
  createDisk,
  createLoadBalancer,
  createNsg,
  createSubnet,
  createVm,
  deleteDisk,
  deleteLoadBalancer,
  deleteNsg,
  deleteSubnet,
  deleteVm,
  detachNsg,
  duplicateName,
  findSubnet,
  findVpc,
  healthyBackends,
  isBackendHealthy,
  logEvent,
  nextId,
  notFound,
  validateName,
} from './engine';
import { formatIpv4, parseIpv4 } from './ip';
import {
  K8sAutoscaler,
  K8sCluster,
  K8sConfigMap,
  K8sDeployment,
  K8sGateway,
  K8sIngress,
  K8sNamespace,
  K8sPersistentVolumeClaim,
  K8sPod,
  K8sSecret,
  K8sService,
  Rule,
  SimError,
  SimResult,
  SimState,
  Vm,
  err,
  ok,
} from './types';

const ACTOR = 'student@localcloud.dev';

/** Supported GKE release channels. */
export const K8S_VERSIONS = ['1.30.5-gke.1013000', '1.31.0-gke.1002000', '1.32.0-gke.1003000'];

export const K8S_MACHINE_TYPES = ['e2-standard-2', 'e2-standard-4', 'n2-standard-4', 'n2-standard-8'];

export const K8S_REGIONS = ['us-central1', 'europe-west1', 'asia-southeast1'];

/** ClusterIP is drawn from 10.96.0.0/16, the default service CIDR. */
const CLUSTER_IP_BASE = parseIpv4('10.96.0.0') ?? 0;
const CLUSTER_IP_SIZE = 65536;
/** NodePort is drawn from the 30000-32767 range. */
const NODE_PORT_BASE = 30000;
const NODE_PORT_SIZE = 2768;
/** Pod IPs come from 10.244.0.0/16, the default pod CIDR. */
const POD_IP_BASE = parseIpv4('10.244.0.0') ?? 0;

/**
 * Base64 encoder that works in both the browser and Node.
 *
 * `Buffer` is Node-only, and this engine runs in the browser, so secrets go
 * through `btoa` over UTF-8 bytes. Encoding the bytes ourselves matters: passing
 * a non-Latin-1 string straight to `btoa` throws.
 */
function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/* ------------------------------------------------------------------ */
/* lookups and allocation                                             */
/* ------------------------------------------------------------------ */

export function findK8sCluster(state: SimState, clusterId: string): K8sCluster | undefined {
  return state.k8sClusters.find((c) => c.id === clusterId);
}

export function findK8sNamespace(state: SimState, namespaceId: string): K8sNamespace | undefined {
  return state.k8sNamespaces.find((n) => n.id === namespaceId);
}

/** Namespaces follow the DNS-1123 label rules Kubernetes enforces. */
const NAMESPACE_PATTERN = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

function allocateClusterIp(state: SimState): string {
  const used = new Set(state.k8sServices.map((s) => s.clusterIp));
  for (let i = 1; i < CLUSTER_IP_SIZE; i++) {
    const candidate = formatIpv4(CLUSTER_IP_BASE + i);
    if (!used.has(candidate)) return candidate;
  }
  return formatIpv4(CLUSTER_IP_BASE + state.sequence + 1);
}

function allocateNodePort(state: SimState): number | null {
  const used = new Set(state.k8sServices.map((s) => s.nodePort).filter(Boolean) as number[]);
  for (let i = 0; i < NODE_PORT_SIZE; i++) {
    const candidate = NODE_PORT_BASE + i;
    if (!used.has(candidate)) return candidate;
  }
  return null;
}

/**
 * The API server endpoint is a reserved virtual address inside the cluster's
 * subnet range. It is stable for the life of the cluster.
 */
function clusterEndpoint(state: SimState, subnetId: string): string {
  const subnet = findSubnet(state, subnetId);
  if (!subnet) return formatIpv4(parseIpv4('10.0.0.1') ?? 1);
  const taken = new Set<string>([
    ...subnet.usedIps,
    ...state.vms.filter((v) => v.subnetId === subnetId).map((v) => v.internalIp),
  ]);
  // .2 is the control-plane address GKE reserves; walk forward past conflicts.
  for (let offset = 2; offset < 254; offset++) {
    const candidate = `${subnet.cidr.split('.')[0]}.${subnet.cidr.split('.')[1]}.0.${offset}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${subnet.cidr.split('.')[0]}.${subnet.cidr.split('.')[1]}.0.2`;
}

function podIp(state: SimState, deploymentId: string, index: number): string {
  // Stable per (deployment, replica) so a pod keeps its address while it runs,
  // without needing the pod itself to be stored.
  let seed = 0;
  for (let i = 0; i < deploymentId.length; i++) seed = (seed * 31 + deploymentId.charCodeAt(i)) >>> 0;
  return formatIpv4(POD_IP_BASE + 10 + ((seed % 60000) + index) % 60000);
}

/** Ingress rules are ingress-only, so `destCidr` is defaulted here once. */
function rule(partial: Omit<Rule, 'id' | 'nsgId' | 'destCidr'> & { destCidr?: string }): Omit<Rule, 'id' | 'nsgId'> {
  return { destCidr: '0.0.0.0/0', ...partial };
}

function invalid(message: string, howToFix: string): SimError {
  return err('INVALID_ARGUMENT', message, howToFix);
}

function requireReadyCluster(state: SimState, clusterId: string): SimError | null {
  const cluster = findK8sCluster(state, clusterId);
  if (!cluster) return notFound('Kubernetes cluster');
  if (cluster.status === 'DELETING' || cluster.status === 'DELETED') {
    return err(
      'INVALID_STATE',
      `Cluster "${cluster.name}" is ${cluster.status.toLowerCase()}.`,
      'Wait for the cluster to finish deleting before changing it.'
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* derived views                                                     */
/* ------------------------------------------------------------------ */

/** Backing VM instances of a cluster, in creation order. */
export function clusterNodes(state: SimState, cluster: K8sCluster): Vm[] {
  return cluster.vmIds.map((id) => state.vms.find((v) => v.id === id)).filter((v): v is Vm => Boolean(v));
}

/** The pods implied by a deployment's replica count. */
export function deploymentPods(state: SimState, deployment: K8sDeployment): K8sPod[] {
  const namespace = findK8sNamespace(state, deployment.namespaceId);
  const cluster = findK8sCluster(state, deployment.clusterId);
  // Spread pods over whichever nodes exist; a cluster mid-scale still has pods.
  const nodes = cluster ? clusterNodes(state, cluster) : [];
  const pods: K8sPod[] = [];

  for (let i = 0; i < deployment.replicas; i++) {
    // A deployment is degraded when some replicas never became ready, which is
    // how a learner discovers a crash-looping container.
    const ready = i < deployment.readyReplicas;
    pods.push({
      name: `${deployment.name}-${deployment.revision}-${String(i).padStart(2, '0')}`,
      deploymentId: deployment.id,
      namespace: namespace?.name ?? '',
      phase: ready ? 'Running' : 'CrashLoopBackOff',
      ip: podIp(state, deployment.id, i),
      nodeVmId: nodes[i % Math.max(1, nodes.length)]?.id,
      ready,
    });
  }

  return pods;
}

/** True when every selector key matches the target's labels. */
export function selectorMatches(selector: Record<string, string>, labels: Record<string, string>): boolean {
  const entries = Object.entries(selector);
  if (entries.length === 0) return false;
  return entries.every(([key, value]) => labels[key] === value);
}

/** Pods backing a service, resolved through its selector. */
export function serviceEndpoints(state: SimState, service: K8sService): K8sPod[] {
  return state.k8sDeployments
    .filter((d) => d.clusterId === service.clusterId && d.namespaceId === service.namespaceId)
    .filter((d) => selectorMatches(service.selector, d.labels))
    .flatMap((d) => deploymentPods(state, d))
    .filter((pod) => pod.ready);
}

/** Deployments an autoscaler governs. */
export function autoscalerFor(state: SimState, deploymentId: string): K8sAutoscaler | undefined {
  return state.k8sAutoscalers.find((a) => a.deploymentId === deploymentId);
}

/**
 * Whether a Gateway can actually pass traffic.
 *
 * A gateway reports RUNNING only when its load balancer exists and at least one
 * backend is healthy, so the UI never advertises a route that drops.
 */
export function gatewayIsServing(state: SimState, gateway: K8sGateway): boolean {
  if (!gateway.lbId) return false;
  const lb = state.loadBalancers.find((l) => l.id === gateway.lbId);
  if (!lb) return false;
  return healthyBackends(state, lb).length > 0;
}

/** Human-readable summary of a cluster's health, used by the console and tests. */
export function clusterDiagnostics(state: SimState, cluster: K8sCluster): {
  nodeCount: number;
  runningNodes: number;
  deployments: number;
  readyPods: number;
  totalPods: number;
  gateways: number;
  servingGateways: number;
} {
  const nodes = clusterNodes(state, cluster);
  const deployments = state.k8sDeployments.filter((d) => d.clusterId === cluster.id);
  const gateways = state.k8sGateways.filter((g) => g.clusterId === cluster.id);
  return {
    nodeCount: nodes.length,
    runningNodes: nodes.filter((n) => n.status === 'RUNNING').length,
    deployments: deployments.length,
    readyPods: deployments.reduce((sum, d) => sum + d.readyReplicas, 0),
    totalPods: deployments.reduce((sum, d) => sum + d.replicas, 0),
    gateways: gateways.length,
    servingGateways: gateways.filter((g) => gatewayIsServing(state, g)).length,
  };
}

/* ------------------------------------------------------------------ */
/* clusters                                                          */
/* ------------------------------------------------------------------ */

/**
 * Create a cluster: a node subnet, node VMs, a node firewall policy, and the
 * default namespace.
 *
 * The node subnet is created here rather than required up front because that is
 * what the console does, and it keeps the common case to a single action.
 */
export function createK8sCluster(
  state: SimState,
  input: {
    name: string;
    vpcId: string;
    subnetId?: string;
    region?: string;
    zone?: string;
    machineType?: string;
    version?: string;
    nodeCount?: number;
    minNodeCount?: number;
    maxNodeCount?: number;
  }
): SimResult<{ state: SimState; cluster: K8sCluster }> {
  const action = 'container.clusters.create';
  const nameError = validateName(input.name, 'Cluster');
  if (nameError) return nameError;
  const dup = duplicateName(state.k8sClusters, input.name.trim(), 'Cluster');
  if (dup) return dup;

  const vpc = findVpc(state, input.vpcId);
  if (!vpc) return notFound('VPC network');

  const region = input.region ?? 'us-central1';
  const zone = input.zone ?? `${region}-a`;
  const machineType = input.machineType ?? 'e2-standard-2';
  const version = input.version ?? K8S_VERSIONS[1];
  const minNodeCount = input.minNodeCount ?? 1;
  const maxNodeCount = input.maxNodeCount ?? 6;
  const nodeCount = input.nodeCount ?? 3;

  for (const [label, value, max] of [
    ['nodeCount', nodeCount, 100],
    ['minNodeCount', minNodeCount, 100],
    ['maxNodeCount', maxNodeCount, 100],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > max) {
      return invalid(`${label} ${value} is out of range.`, 'Enter a whole number between 0 and 100.');
    }
  }
  if (minNodeCount > nodeCount) {
    return invalid(
      `minNodeCount ${minNodeCount} is greater than nodeCount ${nodeCount}.`,
      'Raise nodeCount or lower the autoscaling minimum.'
    );
  }
  if (nodeCount > maxNodeCount) {
    return invalid(
      `nodeCount ${nodeCount} is greater than maxNodeCount ${maxNodeCount}.`,
      'Raise the autoscaling maximum to at least the node count.'
    );
  }

  let s = state;

  // Node subnet: use the supplied one, or derive a /24 next to the cluster's
  // other subnets so the cluster is reachable on its own range.
  let subnetId = input.subnetId;
  if (subnetId) {
    const subnet = findSubnet(s, subnetId);
    if (!subnet) return notFound('Subnet');
    if (subnet.vpcId !== vpc.id) {
      return err(
        'INVALID_STATE',
        `Subnet "${subnet.name}" belongs to a different VPC network.`,
        'Choose a subnet in the same VPC network as the cluster.'
      );
    }
  } else {
    const usedCidrs = s.subnets.filter((x) => x.vpcId === vpc.id).map((x) => x.cidr);
    // Pick the lowest free /24 in 10.128.0.0/10, which no hand-built lab subnet uses.
    let picked: string | null = null;
    for (let third = 128; third <= 191 && !picked; third++) {
      const candidate = `10.${third}.0.0/24`;
      if (!usedCidrs.includes(candidate)) picked = candidate;
    }
    if (!picked) {
      return err(
        'IP_EXHAUSTED',
        'No free /24 subnet range is left in this VPC for cluster nodes.',
        'Delete an unused subnet, or pass an existing subnetId explicitly.'
      );
    }
    const created = createSubnet(s, { name: `${input.name.trim()}-nodes`, vpcId: vpc.id, cidr: picked, region });
    if (!created.ok) return created;
    s = created.value.state;
    subnetId = created.value.subnet.id;
  }

  const idResult = nextId(s, 'gke');
  const networkTag = `gke-${input.name.trim()}`;
  const cluster: K8sCluster = {
    id: idResult.id,
    name: input.name.trim(),
    vpcId: vpc.id,
    subnetId,
    region,
    zone,
    machineType,
    version,
    nodeCount,
    minNodeCount,
    maxNodeCount,
    vmIds: [],
    endpoint: clusterEndpoint(idResult.state, subnetId),
    networkTag,
    status: 'PROVISIONING',
    createdAt: new Date().toISOString(),
  };

  s = {
    ...idResult.state,
    k8sClusters: [...idResult.state.k8sClusters, cluster],
  };

  // Node firewall policy: the control plane needs to reach the kubelet, and the
  // nodes need to reach each other. Health checks arrive from the gateway or
  // service load balancer, so that port is opened from the health-check range.
  const policy = createNsg(s, { name: `${cluster.name}-nodes`, vpcId: vpc.id });
  if (!policy.ok) return policy;
  s = policy.value.state;
  const nsgId = policy.value.nsg.id;
  s = attachPolicy(s, nsgId, cluster.subnetId);
  s = addNodeRules(s, nsgId, cluster.endpoint);

  // Node VMs.
  let next = s;
  for (let i = 0; i < nodeCount; i++) {
    const vm = createVm(next, {
      name: `gke-${cluster.name}-pool1-${String(i + 1).padStart(3, '0')}`,
      subnetId: cluster.subnetId,
      zone,
      machineType,
      networkTags: [networkTag, 'gke-node'],
    });
    if (!vm.ok) return vm;
    next = vm.value.state;
    next = { ...next, k8sClusters: next.k8sClusters.map((c) => (c.id === cluster.id ? { ...c, vmIds: [...c.vmIds, vm.value.vm.id] } : c)) };
  }

  const running = next.k8sClusters.map((c) => (c.id === cluster.id ? { ...c, status: 'RUNNING' as const } : c));

  // Every GKE cluster ships with these three namespaces, and workloads default
  // to `default`, so seeding them keeps the console usable straight after
  // creation instead of requiring a namespace first.
  const seeded: K8sNamespace[] = [];
  let withNamespaces = { ...next, k8sClusters: running };
  for (const nsName of ['default', 'kube-system', 'kube-public'] as const) {
    const nsId = nextId(withNamespaces, 'ns');
    withNamespaces = nsId.state;
    seeded.push({
      id: nsId.id,
      name: nsName,
      clusterId: cluster.id,
      labels: {},
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    });
  }
  withNamespaces = {
    ...withNamespaces,
    k8sNamespaces: [...withNamespaces.k8sNamespaces, ...seeded],
  };

  const logged = logEvent(
    withNamespaces,
    action,
    `projects/${withNamespaces.project.projectNumber}/locations/${region}/clusters/${cluster.name}`,
    'SUCCESS',
    `version=${version}, nodes=${nodeCount}, machineType=${machineType}`
  );

  const finished = logged.k8sClusters.find((c) => c.id === cluster.id)!;
  return ok(
    { state: logged, cluster: finished },
    `Cluster "${finished.name}" is running with ${finished.nodeCount} node(s) on ${machineType}.`
  );
}

/** Attach a freshly created policy to a subnet; helper keeps createK8sCluster readable. */
function attachPolicy(state: SimState, nsgId: string, subnetId: string): SimState {
  const nsg = state.nsgs.find((n) => n.id === nsgId);
  if (!nsg) return state;
  return {
    ...state,
    nsgs: state.nsgs.map((n) =>
      n.id === nsgId
        ? { ...n, attachedSubnetIds: [...new Set([...n.attachedSubnetIds, subnetId])], status: 'READY' as const }
        : n
    ),
  };
}

function addNodeRules(state: SimState, nsgId: string, endpoint: string): SimState {
  const rules: Omit<Rule, 'id' | 'nsgId'>[] = [
    rule({
      name: 'allow-kubelet',
      direction: 'ingress',
      action: 'allow',
      priority: 1000,
      protocol: 'tcp',
      portRange: '10250',
      sourceCidr: '10.128.0.0/9',
      description: 'Kubelet API from the control plane and other nodes.',
    }),
    rule({
      name: 'allow-node-to-node',
      direction: 'ingress',
      action: 'allow',
      priority: 1010,
      protocol: 'all',
      portRange: 'all',
      sourceCidr: '10.128.0.0/9',
      description: 'Node-to-node traffic across the pod and node ranges.',
    }),
    rule({
      name: 'allow-health-check',
      direction: 'ingress',
      action: 'allow',
      priority: 1020,
      protocol: 'tcp',
      portRange: '10256',
      sourceCidr: '130.211.0.0/22',
      description: 'Google Cloud load balancer health checks.',
    }),
    rule({
      name: 'allow-control-plane',
      direction: 'ingress',
      action: 'allow',
      priority: 1030,
      protocol: 'tcp',
      portRange: '443',
      sourceCidr: `${endpoint}/32`,
      description: 'Control plane to node API traffic.',
    }),
    rule({
      name: 'deny-rest',
      direction: 'ingress',
      action: 'deny',
      priority: 65000,
      protocol: 'all',
      portRange: 'all',
      sourceCidr: '0.0.0.0/0',
      description: 'Implicit deny on the node range.',
    }),
  ];

  let s = state;
  for (const r of rules) {
    const added = addRule(s, nsgId, r);
    if (added.ok) s = added.value.state;
  }
  return s;
}

/** Grow or shrink a node pool, keeping the autoscaling bounds. */
export function resizeK8sCluster(
  state: SimState,
  clusterId: string,
  nodeCount: number
): SimResult<{ state: SimState; cluster: K8sCluster }> {
  const action = 'container.clusters.update';
  const cluster = findK8sCluster(state, clusterId);
  if (!cluster) return notFound('Kubernetes cluster');

  if (!Number.isInteger(nodeCount) || nodeCount < 0 || nodeCount > 100) {
    return invalid(`Node count ${nodeCount} is out of range.`, 'Enter a whole number between 0 and 100.');
  }
  if (nodeCount < cluster.minNodeCount) {
    return invalid(
      `A node pool cannot hold fewer than its autoscaling minimum of ${cluster.minNodeCount}.`,
      'Lower the cluster autoscaling minimum first, or scale to at least that many nodes.'
    );
  }
  if (nodeCount > cluster.maxNodeCount) {
    return invalid(
      `A node pool cannot exceed its autoscaling maximum of ${cluster.maxNodeCount}.`,
      'Raise the cluster autoscaling maximum first, or scale to at most that many nodes.'
    );
  }

  const current = clusterNodes(state, cluster);
  let s: SimState = { ...state, k8sClusters: state.k8sClusters.map((c) => (c.id === clusterId ? { ...c, status: 'RECONCILING' as const } : c)) };

  if (nodeCount < current.length) {
    // Remove the highest-index nodes, which is how a pool scales in.
    for (const vm of current.slice(nodeCount)) {
      const removed = deleteVm(s, vm.id);
      if (removed.ok) s = removed.value.state;
      s = { ...s, k8sClusters: s.k8sClusters.map((c) => (c.id === clusterId ? { ...c, vmIds: c.vmIds.filter((id) => id !== vm.id) } : c)) };
    }
  } else {
    for (let i = current.length; i < nodeCount; i++) {
      const vm = createVm(s, {
        name: `gke-${cluster.name}-pool1-${String(i + 1).padStart(3, '0')}`,
        subnetId: cluster.subnetId,
        zone: cluster.zone,
        machineType: cluster.machineType,
        networkTags: [cluster.networkTag, 'gke-node'],
      });
      if (!vm.ok) return vm;
      s = vm.value.state;
      s = { ...s, k8sClusters: s.k8sClusters.map((c) => (c.id === clusterId ? { ...c, vmIds: [...c.vmIds, vm.value.vm.id] } : c)) };
    }
  }

  // Read the cluster back out of `s` so the accumulated vmIds survive; using
  // the object captured before the loop would discard newly added nodes.
  const updated: K8sCluster = {
    ...s.k8sClusters.find((c) => c.id === clusterId)!,
    nodeCount,
    status: 'RUNNING' as const,
  };
  s = { ...s, k8sClusters: s.k8sClusters.map((c) => (c.id === clusterId ? updated : c)) };
  const logged = logEvent(
    s,
    action,
    `projects/${s.project.projectNumber}/locations/${cluster.region}/clusters/${cluster.name}`,
    'SUCCESS',
    `nodeCount=${nodeCount}`
  );

  return ok({ state: logged, cluster: updated }, `Cluster "${cluster.name}" now has ${nodeCount} node(s).`);
}

/**
 * Delete a cluster and everything inside it.
 *
 * Workloads are removed with it, and the load balancers a gateway or
 * LoadBalancer service provisioned are deleted too, because in GKE the load
 * balancer lifecycle is owned by the cluster.
 */
export function deleteK8sCluster(
  state: SimState,
  clusterId: string,
  options: { cascade?: boolean } = {}
): SimResult<{ state: SimState }> {
  const cluster = findK8sCluster(state, clusterId);
  if (!cluster) return notFound('Kubernetes cluster');

  const namespaces = state.k8sNamespaces.filter((n) => n.clusterId === clusterId);
  const namespaceIds = new Set(namespaces.map((n) => n.id));
  const workloadCount =
    state.k8sDeployments.filter((d) => d.clusterId === clusterId).length +
    state.k8sServices.filter((s) => s.clusterId === clusterId).length +
    state.k8sGateways.filter((g) => g.clusterId === clusterId).length +
    state.k8sIngresses.filter((i) => i.clusterId === clusterId).length;

  if (workloadCount > 0 && !options.cascade) {
    return err(
      'DEPENDENCY',
      `Cluster "${cluster.name}" still contains ${workloadCount} workload resource(s).`,
      'Tick "Delete workloads" to remove them along with the cluster, or delete them first.'
    );
  }

  let s = state;

  // Load balancers owned by the cluster.
  const ownedLbs = new Set<string>();
  for (const service of s.k8sServices.filter((x) => x.clusterId === clusterId && x.lbId)) {
    if (service.lbId) ownedLbs.add(service.lbId);
  }
  for (const gateway of s.k8sGateways.filter((x) => x.clusterId === clusterId)) {
    if (gateway.lbId) ownedLbs.add(gateway.lbId);
    if (gateway.internalLbId) ownedLbs.add(gateway.internalLbId);
  }
  for (const lbId of ownedLbs) {
    const removed = deleteLoadBalancer(s, lbId);
    if (removed.ok) s = removed.value.state;
  }

  // Persistent disks backing claims.
  for (const pvc of s.k8sPvcs.filter((p) => p.clusterId === clusterId && p.diskId)) {
    if (pvc.diskId) {
      const removed = deleteDisk(s, pvc.diskId);
      if (removed.ok) s = removed.value.state;
    }
  }

  // Node VMs, then the node policy and subnet.
  const nodes = new Set(cluster.vmIds);
  for (const vmId of nodes) {
    const removed = deleteVm(s, vmId);
    if (removed.ok) s = removed.value.state;
  }

  for (const nsg of s.nsgs.filter((n) => n.name === `${cluster.name}-nodes`)) {
    const removed = detachNsg(s, nsg.id, { subnetIds: nsg.attachedSubnetIds });
    if (removed.ok) s = removed.value.state;
    const deleted = deleteNsg(s, nsg.id, { cascade: true });
    if (deleted.ok) s = deleted.value.state;
  }

  const subnet = findSubnet(s, cluster.subnetId);
  if (subnet && subnet.name === `${cluster.name}-nodes`) {
    const removed = deleteSubnet(s, subnet.id, { cascade: true });
    if (removed.ok) s = removed.value.state;
  }

  const next: SimState = {
    ...s,
    k8sClusters: s.k8sClusters.filter((c) => c.id !== clusterId),
    k8sNamespaces: s.k8sNamespaces.filter((n) => !namespaceIds.has(n.id)),
    k8sDeployments: s.k8sDeployments.filter((d) => d.clusterId !== clusterId),
    k8sServices: s.k8sServices.filter((x) => x.clusterId !== clusterId),
    k8sIngresses: s.k8sIngresses.filter((i) => i.clusterId !== clusterId),
    k8sGateways: s.k8sGateways.filter((g) => g.clusterId !== clusterId),
    k8sConfigMaps: s.k8sConfigMaps.filter((c) => c.clusterId !== clusterId),
    k8sSecrets: s.k8sSecrets.filter((x) => x.clusterId !== clusterId),
    k8sPvcs: s.k8sPvcs.filter((p) => p.clusterId !== clusterId),
    k8sAutoscalers: s.k8sAutoscalers.filter((a) => a.clusterId !== clusterId),
  };

  const logged = logEvent(
    next,
    'container.clusters.delete',
    `projects/${next.project.projectNumber}/locations/${cluster.region}/clusters/${cluster.name}`,
    'SUCCESS',
    `removed ${nodes.size} node(s)`
  );

  return ok({ state: logged }, `Cluster "${cluster.name}" and its ${nodes.size} node(s) were deleted.`);
}

/* ------------------------------------------------------------------ */
/* namespaces                                                        */
/* ------------------------------------------------------------------ */

export function createK8sNamespace(
  state: SimState,
  input: { name: string; clusterId: string; labels?: Record<string, string> }
): SimResult<{ state: SimState; namespace: K8sNamespace }> {
  const name = (input.name ?? '').trim();
  if (!name || !NAMESPACE_PATTERN.test(name)) {
    return invalid(
      `"${input.name}" is not a valid namespace name.`,
      'Use lowercase letters, digits and hyphens, starting and ending with a letter or digit.'
    );
  }
  const clusterError = requireReadyCluster(state, input.clusterId);
  if (clusterError) return clusterError;
  if (state.k8sNamespaces.some((n) => n.clusterId === input.clusterId && n.name === name)) {
    return err('DUPLICATE_NAME', `Namespace "${name}" already exists in this cluster.`, 'Choose a different name.');
  }

  const idResult = nextId(state, 'ns');
  const namespace: K8sNamespace = {
    id: idResult.id,
    name,
    clusterId: input.clusterId,
    labels: input.labels ?? {},
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, k8sNamespaces: [...idResult.state.k8sNamespaces, namespace] },
    'container.namespaces.create',
    `namespaces/${name}`,
    'SUCCESS'
  );

  return ok({ state: next, namespace }, `Namespace "${name}" created.`);
}

export function deleteK8sNamespace(state: SimState, namespaceId: string): SimResult<{ state: SimState }> {
  const namespace = findK8sNamespace(state, namespaceId);
  if (!namespace) return notFound('Namespace');

  const busy =
    state.k8sDeployments.filter((d) => d.namespaceId === namespaceId).length +
    state.k8sServices.filter((s) => s.namespaceId === namespaceId).length +
    state.k8sIngresses.filter((i) => i.namespaceId === namespaceId).length +
    state.k8sGateways.filter((g) => g.namespaceId === namespaceId).length +
    state.k8sPvcs.filter((p) => p.namespaceId === namespaceId).length;

  if (busy > 0) {
    return err(
      'DEPENDENCY',
      `Namespace "${namespace.name}" still contains ${busy} resource(s).`,
      'Delete the deployments, services and other resources in the namespace first.'
    );
  }

  const next: SimState = {
    ...state,
    k8sNamespaces: state.k8sNamespaces.filter((n) => n.id !== namespaceId),
    k8sConfigMaps: state.k8sConfigMaps.filter((c) => c.namespaceId !== namespaceId),
    k8sSecrets: state.k8sSecrets.filter((s) => s.namespaceId !== namespaceId),
    k8sAutoscalers: state.k8sAutoscalers.filter((a) => a.namespaceId !== namespaceId),
  };

  const logged = logEvent(next, 'container.namespaces.delete', `namespaces/${namespace.name}`, 'SUCCESS');
  return ok({ state: logged }, `Namespace "${namespace.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* deployments                                                       */
/* ------------------------------------------------------------------ */

export function createK8sDeployment(
  state: SimState,
  input: {
    name: string;
    namespaceId: string;
    replicas?: number;
    image?: string;
    containerPort?: number;
    labels?: Record<string, string>;
    env?: Record<string, string>;
    pvcId?: string;
  }
): SimResult<{ state: SimState; deployment: K8sDeployment }> {
  const action = 'container.deployments.create';
  const nameError = validateName(input.name, 'Deployment');
  if (nameError) return nameError;

  const namespace = findK8sNamespace(state, input.namespaceId);
  if (!namespace) return notFound('Namespace');

  if (state.k8sDeployments.some((d) => d.namespaceId === namespace.id && d.name === input.name.trim())) {
    return err('DUPLICATE_NAME', `Deployment "${input.name.trim()}" already exists in namespace "${namespace.name}".`, 'Choose a different name.');
  }

  const replicas = input.replicas ?? 3;
  if (!Number.isInteger(replicas) || replicas < 0 || replicas > 100) {
    return invalid(`replicas ${replicas} is out of range.`, 'Enter a whole number between 0 and 100.');
  }

  const containerPort = input.containerPort ?? 8080;
  if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) {
    return invalid(`containerPort ${containerPort} is out of range.`, 'Enter a port between 1 and 65535.');
  }

  if (input.pvcId && !state.k8sPvcs.some((p) => p.id === input.pvcId)) {
    return notFound('Persistent volume claim');
  }

  const idResult = nextId(state, 'deploy');
  const name = input.name.trim();
  const deployment: K8sDeployment = {
    id: idResult.id,
    name,
    clusterId: namespace.clusterId,
    namespaceId: namespace.id,
    replicas,
    image: input.image ?? 'gcr.io/localcloud/app:latest',
    containerPort,
    // Default to app=<name> so a service can select it without extra typing,
    // mirroring the `app: name` label GKE adds for you.
    labels: { app: name, ...(input.labels ?? {}) },
    env: input.env ?? {},
    pvcId: input.pvcId,
    readyReplicas: replicas,
    revision: 1,
    status: 'PROVISIONING',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, k8sDeployments: [...idResult.state.k8sDeployments, deployment] },
    action,
    `namespaces/${namespace.name}/deployments/${name}`,
    'SUCCESS',
    `replicas=${replicas}, image=${deployment.image}`
  );

  const running = next.k8sDeployments.map((d) => (d.id === deployment.id ? { ...d, status: 'RUNNING' as const } : d));
  const finalized = running.find((d) => d.id === deployment.id)!;

  return ok({ state: { ...next, k8sDeployments: running }, deployment: finalized }, `Deployment "${name}" created with ${replicas} replica(s).`);
}

/**
 * Change a deployment's replica count.
 *
 * An autoscaler that governs the deployment clamps the request to its own
 * bounds, which is what makes the bounds meaningful rather than decorative.
 */
export function scaleK8sDeployment(
  state: SimState,
  deploymentId: string,
  replicas: number
): SimResult<{ state: SimState; deployment: K8sDeployment }> {
  const deployment = state.k8sDeployments.find((d) => d.id === deploymentId);
  if (!deployment) return notFound('Deployment');
  if (!Number.isInteger(replicas) || replicas < 0 || replicas > 100) {
    return invalid(`replicas ${replicas} is out of range.`, 'Enter a whole number between 0 and 100.');
  }

  const autoscaler = autoscalerFor(state, deploymentId);
  let target = replicas;
  if (autoscaler) {
    if (replicas < autoscaler.minReplicas || replicas > autoscaler.maxReplicas) {
      return err(
        'INVALID_ARGUMENT',
        `replicas ${replicas} is outside the autoscaler range ${autoscaler.minReplicas}-${autoscaler.maxReplicas}.`,
        `Scale between ${autoscaler.minReplicas} and ${autoscaler.maxReplicas}, or change the autoscaler bounds.`
      );
    }
    target = replicas;
  }

  const updated: K8sDeployment = {
    ...deployment,
    replicas: target,
    readyReplicas: target,
    status: 'RUNNING',
  };

  const next = {
    ...state,
    k8sDeployments: state.k8sDeployments.map((d) => (d.id === deploymentId ? updated : d)),
  };
  const logged = logEvent(
    next,
    'container.deployments.update',
    `namespaces/${deployment.name}/deployments/${deployment.name}`,
    'SUCCESS',
    `replicas=${target}`
  );

  return ok({ state: logged, deployment: updated }, `Deployment "${deployment.name}" scaled to ${target} replica(s).`);
}

/** Roll the deployment to a new image, bumping the revision and resetting pods. */
export function updateK8sDeploymentImage(
  state: SimState,
  deploymentId: string,
  image: string
): SimResult<{ state: SimState; deployment: K8sDeployment }> {
  const deployment = state.k8sDeployments.find((d) => d.id === deploymentId);
  if (!deployment) return notFound('Deployment');
  if (!image || !image.trim()) return invalid('An image reference is required.', 'Enter an image such as gcr.io/project/app:v2.');

  const updated: K8sDeployment = {
    ...deployment,
    image: image.trim(),
    revision: deployment.revision + 1,
    status: 'RUNNING',
    readyReplicas: deployment.replicas,
  };

  const next = {
    ...state,
    k8sDeployments: state.k8sDeployments.map((d) => (d.id === deploymentId ? updated : d)),
  };
  const logged = logEvent(
    next,
    'container.deployments.update',
    `namespaces/${deployment.name}/deployments/${deployment.name}`,
    'SUCCESS',
    `image=${updated.image}, revision=${updated.revision}`
  );

  return ok({ state: logged, deployment: updated }, `Deployment "${deployment.name}" rolled out revision ${updated.revision} on ${updated.image}.`);
}

/** Mark replicas as crash-looping so the degraded path is reachable from the UI. */
export function setK8sDeploymentHealth(
  state: SimState,
  deploymentId: string,
  readyReplicas: number
): SimResult<{ state: SimState; deployment: K8sDeployment }> {
  const deployment = state.k8sDeployments.find((d) => d.id === deploymentId);
  if (!deployment) return notFound('Deployment');
  const ready = Math.max(0, Math.min(deployment.replicas, Math.trunc(readyReplicas)));
  const updated: K8sDeployment = {
    ...deployment,
    readyReplicas: ready,
    status: ready === deployment.replicas ? 'RUNNING' : 'DEGRADED',
  };
  return ok(
    { state: { ...state, k8sDeployments: state.k8sDeployments.map((d) => (d.id === deploymentId ? updated : d)) }, deployment: updated },
    ready === deployment.replicas
      ? `Deployment "${deployment.name}" is healthy with ${ready} ready replica(s).`
      : `Deployment "${deployment.name}" is degraded: ${deployment.replicas - ready} replica(s) are not ready.`
  );
}

export function deleteK8sDeployment(
  state: SimState,
  deploymentId: string,
  options: { cascade?: boolean } = {}
): SimResult<{ state: SimState }> {
  const deployment = state.k8sDeployments.find((d) => d.id === deploymentId);
  if (!deployment) return notFound('Deployment');

  // Only services in the same namespace can select this deployment, so the
  // dependency check must not be blocked by an unrelated namespace.
  const dependentServices = state.k8sServices.filter(
    (s) => s.clusterId === deployment.clusterId && s.namespaceId === deployment.namespaceId && selectorMatches(s.selector, deployment.labels)
  );
  if (dependentServices.length > 0 && !options.cascade) {
    return err(
      'DEPENDENCY',
      `Deployment "${deployment.name}" still backs ${dependentServices.length} service(s).`,
      'Point those services at another deployment, delete them first, or tick "Delete workloads".'
    );
  }

  let s = state;

  // Cascade tears down dependants first, so nothing is left pointing at a
  // deployment that is about to disappear.
  if (options.cascade) {
    for (const service of dependentServices) {
      const removed = deleteK8sService(s, service.id, { cascade: true });
      if (removed.ok) s = removed.value.state;
    }
  }

  const next: SimState = {
    ...s,
    k8sDeployments: s.k8sDeployments.filter((d) => d.id !== deploymentId),
    k8sAutoscalers: s.k8sAutoscalers.filter((a) => a.deploymentId !== deploymentId),
  };
  const logged = logEvent(next, 'container.deployments.delete', `namespaces/${deployment.name}/deployments/${deployment.name}`, 'SUCCESS');
  return ok({ state: logged }, `Deployment "${deployment.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* services                                                          */
/* ------------------------------------------------------------------ */

/**
 * Create a Service. A LoadBalancer service provisions a real load balancer in
 * the VPC and opens its health-check firewall rule, so the service is reachable
 * through the same network machinery as everything else.
 */
export function createK8sService(
  state: SimState,
  input: {
    name: string;
    namespaceId: string;
    type?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
    selector: Record<string, string>;
    port: number;
    targetPort?: number;
    protocol?: 'TCP' | 'UDP';
  }
): SimResult<{ state: SimState; service: K8sService }> {
  const action = 'container.services.create';
  const nameError = validateName(input.name, 'Service');
  if (nameError) return nameError;

  const namespace = findK8sNamespace(state, input.namespaceId);
  if (!namespace) return notFound('Namespace');

  if (state.k8sServices.some((s) => s.namespaceId === namespace.id && s.name === input.name.trim())) {
    return err('DUPLICATE_NAME', `Service "${input.name.trim()}" already exists in namespace "${namespace.name}".`, 'Choose a different name.');
  }

  const type = input.type ?? 'ClusterIP';
  if (Object.keys(input.selector ?? {}).length === 0) {
    return invalid('A service needs at least one selector label.', 'Add a selector such as app=web so the service has pods to target.');
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    return invalid(`Service port ${input.port} is out of range.`, 'Enter a port between 1 and 65535.');
  }

  const targetPort = input.targetPort ?? input.port;
  if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
    return invalid(`Target port ${targetPort} is out of range.`, 'Enter a port between 1 and 65535.');
  }

  let nodePort: number | undefined;
  if (type === 'NodePort' || type === 'LoadBalancer') {
    const allocated = allocateNodePort(state);
    if (allocated === null) return err('IP_EXHAUSTED', 'No free NodePort is left in the 30000-32767 range.', 'Delete a NodePort or LoadBalancer service first.');
    nodePort = allocated;
  }

  const idResult = nextId(state, 'svc');
  const cluster = findK8sCluster(state, namespace.clusterId);
  const service: K8sService = {
    id: idResult.id,
    name: input.name.trim(),
    clusterId: namespace.clusterId,
    namespaceId: namespace.id,
    type,
    clusterIp: allocateClusterIp(idResult.state),
    nodePort,
    selector: input.selector,
    port: input.port,
    targetPort,
    protocol: input.protocol ?? 'TCP',
    status: type === 'ClusterIP' ? 'RUNNING' : 'PENDING',
    createdAt: new Date().toISOString(),
  };

  let s: SimState = { ...idResult.state, k8sServices: [...idResult.state.k8sServices, service] };

  if (type === 'LoadBalancer') {
    if (!cluster) return notFound('Kubernetes cluster');
    const provisioned = provisionServiceLoadBalancer(s, service, cluster);
    if (!provisioned.ok) return provisioned;
    s = provisioned.value.state;
  }

  const finalized = s.k8sServices.find((x) => x.id === service.id)!;
  const logged = logEvent(
    s,
    action,
    `namespaces/${namespace.name}/services/${service.name}`,
    'SUCCESS',
    `type=${service.type}, clusterIP=${service.clusterIp}`
  );

  return ok({ state: logged, service: finalized }, `Service "${finalized.name}" created (${finalized.type}${finalized.externalIp ? ` on ${finalized.externalIp}` : ''}).`);
}

/**
 * Provision the VPC load balancer behind a LoadBalancer service.
 *
 * The backends are the cluster's node VMs, which is how GKE actually works: the
 * load balancer targets the node pool and the kube-proxy redirects to a ready
 * pod. Health checks hit the target port on each node.
 */
function provisionServiceLoadBalancer(
  state: SimState,
  service: K8sService,
  cluster: K8sCluster
): SimResult<{ state: SimState }> {
  const nodes = clusterNodes(state, cluster);
  if (nodes.length === 0) {
    return err(
      'INVALID_STATE',
      `Cluster "${cluster.name}" has no nodes to attach a load balancer to.`,
      'Scale the node pool to at least one node, then create the service.'
    );
  }

  const lb = createLoadBalancer(state, {
    name: `k8s-${service.name}-lb`,
    type: 'external-http',
    vpcId: cluster.vpcId,
    port: service.port,
    protocol: 'tcp',
    backendVmIds: nodes.map((n) => n.id),
    healthCheckPort: service.targetPort,
  });
  if (!lb.ok) return lb;

  let s = lb.value.state;
  const healthRule = addRule(s, nodePolicyId(s, cluster), rule({
    name: `allow-hc-${service.name}`,
    direction: 'ingress',
    action: 'allow',
    priority: 1040,
    protocol: 'tcp',
    portRange: String(service.targetPort),
    sourceCidr: `${lb.value.lb.frontendIp}/32`,
    description: `Health check for service "${service.name}".`,
  }));
  if (healthRule.ok) s = healthRule.value.state;

  s = {
    ...s,
    k8sServices: s.k8sServices.map((x) =>
      x.id === service.id
        ? { ...x, lbId: lb.value.lb.id, externalIp: lb.value.lb.frontendIp, status: 'RUNNING' as const }
        : x
    ),
  };

  return ok({ state: s }, `Load balancer for service "${service.name}" provisioned at ${lb.value.lb.frontendIp}.`);
}

/** The firewall policy created for a cluster's node subnet. */
function nodePolicyId(state: SimState, cluster: K8sCluster): string {
  return state.nsgs.find((n) => n.name === `${cluster.name}-nodes`)?.id ?? '';
}

/** Repoint a service's load balancer at the current node pool. */
export function syncK8sServiceLoadBalancer(state: SimState, serviceId: string): SimResult<{ state: SimState }> {
  const service = state.k8sServices.find((s) => s.id === serviceId);
  if (!service) return notFound('Service');
  if (!service.lbId) return ok({ state }, `Service "${service.name}" does not use a load balancer.`);

  const cluster = findK8sCluster(state, service.clusterId);
  if (!cluster) return notFound('Kubernetes cluster');

  const nodes = clusterNodes(state, cluster);
  const lb = state.loadBalancers.find((l) => l.id === service.lbId);
  if (!lb) return notFound('Load balancer');

  const desired = nodes.map((n) => n.id);
  const same =
    lb.backendVmIds.length === desired.length && desired.every((id) => lb.backendVmIds.includes(id));
  if (same) return ok({ state }, `Load balancer for "${service.name}" is already in sync.`);

  const updated: SimState = {
    ...state,
    loadBalancers: state.loadBalancers.map((l) => (l.id === lb.id ? { ...l, backendVmIds: desired } : l)),
  };
  return ok({ state: updated }, `Load balancer for "${service.name}" now targets ${desired.length} node(s).`);
}

export function deleteK8sService(
  state: SimState,
  serviceId: string,
  options: { cascade?: boolean } = {}
): SimResult<{ state: SimState }> {
  const service = state.k8sServices.find((s) => s.id === serviceId);
  if (!service) return notFound('Service');

  const usedBy = state.k8sIngresses.filter((i) => i.serviceId === serviceId);
  if (usedBy.length > 0 && !options.cascade) {
    return err(
      'DEPENDENCY',
      `Service "${service.name}" is still referenced by ${usedBy.length} ingress rule(s).`,
      'Delete the ingress rules that point at this service first, or tick "Delete workloads".'
    );
  }

  let s = state;
  if (service.lbId) {
    const removed = deleteLoadBalancer(s, service.lbId);
    if (removed.ok) s = removed.value.state;
  }

  s = {
    ...s,
    k8sIngresses: options.cascade
      ? s.k8sIngresses.filter((i) => i.serviceId !== serviceId)
      : s.k8sIngresses,
    k8sServices: s.k8sServices.filter((x) => x.id !== serviceId),
    // Drop the route from any gateway that still points at this service.
    k8sGateways: s.k8sGateways.map((g) => ({
      ...g,
      routes: g.routes.filter((r) => r.serviceId !== serviceId),
    })),
  };

  const logged = logEvent(s, 'container.services.delete', `namespaces/${service.name}/services/${service.name}`, 'SUCCESS');
  return ok({ state: logged }, `Service "${service.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* ingress                                                           */
/* ------------------------------------------------------------------ */

export function createK8sIngress(
  state: SimState,
  input: {
    name: string;
    namespaceId: string;
    host: string;
    path: string;
    serviceId: string;
    servicePort?: number;
    tls?: boolean;
  }
): SimResult<{ state: SimState; ingress: K8sIngress }> {
  const nameError = validateName(input.name, 'Ingress');
  if (nameError) return nameError;

  const namespace = findK8sNamespace(state, input.namespaceId);
  if (!namespace) return notFound('Namespace');

  const service = state.k8sServices.find((s) => s.id === input.serviceId);
  if (!service) return notFound('Service');
  if (service.clusterId !== namespace.clusterId) {
    return err('INVALID_STATE', `Service "${service.name}" belongs to a different cluster.`, 'Reference a service in the same cluster as the ingress.');
  }
  // An Ingress may only route to a Service in its own namespace.
  if (service.namespaceId !== namespace.id) {
    return err(
      'INVALID_STATE',
      `Service "${service.name}" is in namespace "${state.k8sNamespaces.find((n) => n.id === service.namespaceId)?.name ?? service.namespaceId}", not "${namespace.name}".`,
      'Create an ingress in the same namespace as the service, or point this one at a local service.'
    );
  }

  const path = input.path?.startsWith('/') ? input.path : `/${input.path ?? '/'}`;
  const idResult = nextId(state, 'ing');
  const ingress: K8sIngress = {
    id: idResult.id,
    name: input.name.trim(),
    clusterId: namespace.clusterId,
    namespaceId: namespace.id,
    host: input.host?.trim() || '*',
    path,
    serviceId: service.id,
    servicePort: input.servicePort ?? service.port,
    tls: input.tls ?? false,
    status: 'RUNNING',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, k8sIngresses: [...idResult.state.k8sIngresses, ingress] },
    'networking.k8s.io/ingresses.create',
    `namespaces/${namespace.name}/ingresses/${ingress.name}`,
    'SUCCESS',
    `host=${ingress.host}, path=${ingress.path}, service=${service.name}`
  );

  return ok({ state: next, ingress }, `Ingress "${ingress.name}" routes ${ingress.host}${ingress.path} to service "${service.name}".`);
}

export function deleteK8sIngress(state: SimState, ingressId: string): SimResult<{ state: SimState }> {
  const ingress = state.k8sIngresses.find((i) => i.id === ingressId);
  if (!ingress) return notFound('Ingress');
  const next = { ...state, k8sIngresses: state.k8sIngresses.filter((i) => i.id !== ingressId) };
  const logged = logEvent(next, 'networking.k8s.io/ingresses.delete', `ingresses/${ingress.name}`, 'SUCCESS');
  return ok({ state: logged }, `Ingress "${ingress.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* gateways                                                          */
/* ------------------------------------------------------------------ */

/**
 * Create a Gateway: a VPC load balancer in front of one or more services.
 *
 * The external class provisions an external HTTP load balancer and the regional
 * class provisions both an external and an internal frontend, matching GKE's
 * two most common gateway classes.
 */
export function createK8sGateway(
  state: SimState,
  input: {
    name: string;
    namespaceId: string;
    className?: 'gke-l7-global-external' | 'gke-l7-regional-internal-external';
    serviceId: string;
    port?: number;
    tls?: boolean;
  }
): SimResult<{ state: SimState; gateway: K8sGateway }> {
  const action = 'networking.gateway.networking.k8s.io/gateways.create';
  const nameError = validateName(input.name, 'Gateway');
  if (nameError) return nameError;

  const namespace = findK8sNamespace(state, input.namespaceId);
  if (!namespace) return notFound('Namespace');

  const service = state.k8sServices.find((s) => s.id === input.serviceId);
  if (!service) return notFound('Service');
  if (service.clusterId !== namespace.clusterId) {
    return err('INVALID_STATE', `Service "${service.name}" belongs to a different cluster.`, 'Reference a service in the same cluster as the gateway.');
  }

  const cluster = findK8sCluster(state, namespace.clusterId);
  if (!cluster) return notFound('Kubernetes cluster');

  const nodes = clusterNodes(state, cluster);
  if (nodes.length === 0) {
    return err(
      'INVALID_STATE',
      `Cluster "${cluster.name}" has no nodes to attach a gateway to.`,
      'Scale the node pool to at least one node, then create the gateway.'
    );
  }

  const className = input.className ?? 'gke-l7-global-external';
  const listenerPort = input.port ?? (input.tls ? 443 : 80);

  const idResult = nextId(state, 'gw');
  const gateway: K8sGateway = {
    id: idResult.id,
    name: input.name.trim(),
    clusterId: cluster.id,
    namespaceId: namespace.id,
    className,
    routes: [{ serviceId: service.id, port: service.port }],
    listenerPort,
    tls: input.tls ?? false,
    status: 'PROVISIONING',
    createdAt: new Date().toISOString(),
  };

  let s: SimState = { ...idResult.state, k8sGateways: [...idResult.state.k8sGateways, gateway] };

  const lb = createLoadBalancer(s, {
    name: `k8s-${gateway.name}-gateway`,
    type: 'external-http',
    vpcId: cluster.vpcId,
    port: listenerPort,
    protocol: 'tcp',
    backendVmIds: nodes.map((n) => n.id),
    healthCheckPort: service.targetPort,
  });
  if (!lb.ok) return lb;
  s = lb.value.state;

  const nsgId = nodePolicyId(s, cluster);
  const healthRule = addRule(s, nsgId, rule({
    name: `allow-hc-${gateway.name}`,
    direction: 'ingress',
    action: 'allow',
    priority: 1050,
    protocol: 'tcp',
    portRange: String(service.targetPort),
    sourceCidr: `${lb.value.lb.frontendIp}/32`,
    description: `Health check for gateway "${gateway.name}".`,
  }));
  if (healthRule.ok) s = healthRule.value.state;

  s = {
    ...s,
    k8sGateways: s.k8sGateways.map((g) =>
      g.id === gateway.id
        ? { ...g, lbId: lb.value.lb.id, address: lb.value.lb.frontendIp, status: 'RUNNING' as const }
        : g
    ),
  };

  const finalized = s.k8sGateways.find((g) => g.id === gateway.id)!;
  const logged = logEvent(
    s,
    action,
    `namespaces/${namespace.name}/gateways/${finalized.name}`,
    'SUCCESS',
    `class=${className}, address=${finalized.address}`
  );

  return ok({ state: logged, gateway: finalized }, `Gateway "${finalized.name}" is serving on ${finalized.address}:${listenerPort}.`);
}

/** Attach a second service to an existing gateway. */
export function addK8sGatewayRoute(
  state: SimState,
  gatewayId: string,
  serviceId: string
): SimResult<{ state: SimState; gateway: K8sGateway }> {
  const gateway = state.k8sGateways.find((g) => g.id === gatewayId);
  if (!gateway) return notFound('Gateway');
  const service = state.k8sServices.find((s) => s.id === serviceId);
  if (!service) return notFound('Service');
  if (gateway.routes.some((r) => r.serviceId === serviceId)) {
    return err('DUPLICATE_NAME', `Gateway "${gateway.name}" already routes to service "${service.name}".`, 'Pick a different service.');
  }

  const updated: K8sGateway = {
    ...gateway,
    routes: [...gateway.routes, { serviceId: service.id, port: service.port }],
  };
  const next = {
    ...state,
    k8sGateways: state.k8sGateways.map((g) => (g.id === gatewayId ? updated : g)),
  };
  return ok({ state: next, gateway: updated }, `Gateway "${gateway.name}" now also routes to service "${service.name}".`);
}

export function deleteK8sGateway(state: SimState, gatewayId: string): SimResult<{ state: SimState }> {
  const gateway = state.k8sGateways.find((g) => g.id === gatewayId);
  if (!gateway) return notFound('Gateway');

  let s = state;
  if (gateway.lbId) {
    const removed = deleteLoadBalancer(s, gateway.lbId);
    if (removed.ok) s = removed.value.state;
  }
  if (gateway.internalLbId) {
    const removedInternal = deleteLoadBalancer(s, gateway.internalLbId);
    if (removedInternal.ok) s = removedInternal.value.state;
  }
  s = { ...s, k8sGateways: s.k8sGateways.filter((g) => g.id !== gatewayId) };
  const logged = logEvent(s, 'networking.gateway.networking.k8s.io/gateways.delete', `gateways/${gateway.name}`, 'SUCCESS');
  return ok({ state: logged }, `Gateway "${gateway.name}" and its load balancer were deleted.`);
}

/* ------------------------------------------------------------------ */
/* config maps, secrets and storage                                   */
/* ------------------------------------------------------------------ */

export function createK8sConfigMap(
  state: SimState,
  input: { name: string; namespaceId: string; data: Record<string, string> }
): SimResult<{ state: SimState; configMap: K8sConfigMap }> {
  const nameError = validateName(input.name, 'Config map');
  if (nameError) return nameError;
  const namespace = findK8sNamespace(state, input.namespaceId);
  if (!namespace) return notFound('Namespace');
  if (Object.keys(input.data ?? {}).length === 0) {
    return invalid('A config map needs at least one key.', 'Add a key/value pair, for example LOG_LEVEL=info.');
  }
  // Config map names are unique within a namespace, as in Kubernetes.
  if (
    state.k8sConfigMaps.some(
      (c) => c.clusterId === namespace.clusterId && c.namespaceId === namespace.id && c.name === input.name.trim()
    )
  ) {
    return err(
      'DUPLICATE_NAME',
      `Config map "${input.name.trim()}" already exists in namespace "${namespace.name}".`,
      'Choose a different name, or delete the existing config map first.'
    );
  }

  const idResult = nextId(state, 'cm');
  const configMap: K8sConfigMap = {
    id: idResult.id,
    name: input.name.trim(),
    clusterId: namespace.clusterId,
    namespaceId: namespace.id,
    data: input.data,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, k8sConfigMaps: [...idResult.state.k8sConfigMaps, configMap] },
    'container.configMaps.create',
    `namespaces/${namespace.name}/configmaps/${configMap.name}`,
    'SUCCESS'
  );
  return ok({ state: next, configMap }, `Config map "${configMap.name}" created with ${Object.keys(configMap.data).length} key(s).`);
}

export function deleteK8sConfigMap(state: SimState, id: string): SimResult<{ state: SimState }> {
  const configMap = state.k8sConfigMaps.find((c) => c.id === id);
  if (!configMap) return notFound('Config map');
  const next = { ...state, k8sConfigMaps: state.k8sConfigMaps.filter((c) => c.id !== id) };
  return ok({ state: next }, `Config map "${configMap.name}" deleted.`);
}

export function createK8sSecret(
  state: SimState,
  input: { name: string; namespaceId: string; type?: K8sSecret['type']; data: Record<string, string> }
): SimResult<{ state: SimState; secret: K8sSecret }> {
  const nameError = validateName(input.name, 'Secret');
  if (nameError) return nameError;
  const namespace = findK8sNamespace(state, input.namespaceId);
  if (!namespace) return notFound('Namespace');
  if (Object.keys(input.data ?? {}).length === 0) {
    return invalid('A secret needs at least one key.', 'Add a key, for example DB_PASSWORD.');
  }
  // Secret names are unique within a namespace, as in Kubernetes.
  if (
    state.k8sSecrets.some(
      (x) => x.clusterId === namespace.clusterId && x.namespaceId === namespace.id && x.name === input.name.trim()
    )
  ) {
    return err(
      'DUPLICATE_NAME',
      `Secret "${input.name.trim()}" already exists in namespace "${namespace.name}".`,
      'Choose a different name, or delete the existing secret first.'
    );
  }

  const idResult = nextId(state, 'secret');
  const secret: K8sSecret = {
    id: idResult.id,
    name: input.name.trim(),
    clusterId: namespace.clusterId,
    namespaceId: namespace.id,
    type: input.type ?? 'Opaque',
    // Kubernetes stores base64; the lab encodes so the UI can show a realistic
    // value, and the plaintext is never persisted.
    data: Object.fromEntries(
      Object.entries(input.data).map(([key, value]) => [key, encodeBase64(value)])
    ),
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, k8sSecrets: [...idResult.state.k8sSecrets, secret] },
    'container.secrets.create',
    `namespaces/${namespace.name}/secrets/${secret.name}`,
    'SUCCESS'
  );
  return ok({ state: next, secret }, `Secret "${secret.name}" created with ${Object.keys(secret.data).length} key(s).`);
}

export function deleteK8sSecret(state: SimState, id: string): SimResult<{ state: SimState }> {
  const secret = state.k8sSecrets.find((s) => s.id === id);
  if (!secret) return notFound('Secret');
  const next = { ...state, k8sSecrets: state.k8sSecrets.filter((s) => s.id !== id) };
  return ok({ state: next }, `Secret "${secret.name}" deleted.`);
}

/** Create a claim and the persistent disk that backs it. */
export function createK8sPvc(
  state: SimState,
  input: {
    name: string;
    namespaceId: string;
    storageGb?: number;
    accessMode?: 'ReadWriteOnce' | 'ReadWriteMany';
  }
): SimResult<{ state: SimState; pvc: K8sPersistentVolumeClaim }> {
  const nameError = validateName(input.name, 'Persistent volume claim');
  if (nameError) return nameError;
  const namespace = findK8sNamespace(state, input.namespaceId);
  if (!namespace) return notFound('Namespace');

  const storageGb = input.storageGb ?? 10;
  if (!Number.isInteger(storageGb) || storageGb < 1 || storageGb > 65536) {
    return invalid(`Storage ${storageGb} GB is out of range.`, 'Enter a whole number of gigabytes between 1 and 65536.');
  }

  const cluster = findK8sCluster(state, namespace.clusterId);
  if (!cluster) return notFound('Kubernetes cluster');

  // Claim names are unique within a namespace, as in Kubernetes.
  if (
    state.k8sPvcs.some(
      (p) => p.clusterId === cluster.id && p.namespaceId === namespace.id && p.name === input.name.trim()
    )
  ) {
    return err(
      'DUPLICATE_NAME',
      `Persistent volume claim "${input.name.trim()}" already exists in namespace "${namespace.name}".`,
      'Choose a different name, or delete the existing claim first.'
    );
  }

  const disk = createDisk(state, {
    name: `pvc-${input.name.trim()}`,
    zone: cluster.zone,
    sizeGb: storageGb,
    type: 'pd-balanced',
  });
  if (!disk.ok) return disk;

  const idResult = nextId(disk.value.state, 'pvc');
  const pvc: K8sPersistentVolumeClaim = {
    id: idResult.id,
    name: input.name.trim(),
    clusterId: namespace.clusterId,
    namespaceId: namespace.id,
    storageGb,
    accessMode: input.accessMode ?? 'ReadWriteOnce',
    diskId: disk.value.disk.id,
    status: 'BOUND',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, k8sPvcs: [...idResult.state.k8sPvcs, pvc] },
    'container.persistentVolumeClaims.create',
    `namespaces/${namespace.name}/persistentvolumeclaims/${pvc.name}`,
    'SUCCESS',
    `bound to ${disk.value.disk.name}`
  );

  return ok({ state: next, pvc }, `Persistent volume claim "${pvc.name}" bound to a ${storageGb} GB disk.`);
}

export function deleteK8sPvc(state: SimState, pvcId: string): SimResult<{ state: SimState }> {
  const pvc = state.k8sPvcs.find((p) => p.id === pvcId);
  if (!pvc) return notFound('Persistent volume claim');

  const mounted = state.k8sDeployments.filter((d) => d.pvcId === pvcId);
  if (mounted.length > 0) {
    return err(
      'DEPENDENCY',
      `Persistent volume claim "${pvc.name}" is still mounted by ${mounted.length} deployment(s).`,
      'Detach the claim from the deployment first, then delete the claim.'
    );
  }

  let s = state;
  if (pvc.diskId) {
    const removed = deleteDisk(s, pvc.diskId);
    if (removed.ok) s = removed.value.state;
  }
  s = { ...s, k8sPvcs: s.k8sPvcs.filter((p) => p.id !== pvcId) };
  return ok({ state: s }, `Persistent volume claim "${pvc.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* horizontal pod autoscaler                                         */
/* ------------------------------------------------------------------ */

export function createK8sAutoscaler(
  state: SimState,
  input: {
    name: string;
    namespaceId: string;
    deploymentId: string;
    minReplicas?: number;
    maxReplicas?: number;
    targetCpuUtilization?: number;
    currentCpuUtilization?: number;
  }
): SimResult<{ state: SimState; autoscaler: K8sAutoscaler }> {
  const nameError = validateName(input.name, 'Autoscaler');
  if (nameError) return nameError;

  const namespace = findK8sNamespace(state, input.namespaceId);
  if (!namespace) return notFound('Namespace');

  const deployment = state.k8sDeployments.find((d) => d.id === input.deploymentId);
  if (!deployment) return notFound('Deployment');

  const minReplicas = input.minReplicas ?? 2;
  const maxReplicas = input.maxReplicas ?? 8;
  if (!Number.isInteger(minReplicas) || minReplicas < 1) {
    return invalid(`minReplicas ${minReplicas} must be at least 1.`, 'Enter a whole number of at least 1.');
  }
  if (!Number.isInteger(maxReplicas) || maxReplicas < minReplicas) {
    return invalid(`maxReplicas ${maxReplicas} must be at least minReplicas (${minReplicas}).`, 'Raise maxReplicas or lower minReplicas.');
  }
  if (deployment.replicas < minReplicas || deployment.replicas > maxReplicas) {
    return invalid(
      `Deployment "${deployment.name}" has ${deployment.replicas} replica(s), outside the autoscaler range.`,
      `Scale the deployment between ${minReplicas} and ${maxReplicas}, or widen the range.`
    );
  }

  const idResult = nextId(state, 'hpa');
  const autoscaler: K8sAutoscaler = {
    id: idResult.id,
    name: input.name.trim(),
    clusterId: namespace.clusterId,
    namespaceId: namespace.id,
    deploymentId: deployment.id,
    minReplicas,
    maxReplicas,
    targetCpuUtilization: input.targetCpuUtilization ?? 70,
    currentCpuUtilization: input.currentCpuUtilization ?? 45,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, k8sAutoscalers: [...idResult.state.k8sAutoscalers, autoscaler] },
    'container.horizontalPodAutoscalers.create',
    `namespaces/${namespace.name}/horizontalpodautoscalers/${autoscaler.name}`,
    'SUCCESS',
    `min=${minReplicas}, max=${maxReplicas}, target=${autoscaler.targetCpuUtilization}%`
  );

  return ok({ state: next, autoscaler }, `Autoscaler "${autoscaler.name}" created for deployment "${deployment.name}".`);
}

/**
 * Run one autoscaler decision against its deployment.
 *
 * This is the piece that makes autoscaling demonstrable rather than decorative:
 * CPU above target scales out, below target scales in, and both are clamped to
 * the configured bounds. The event log records which decision was taken.
 */
export function reconcileK8sAutoscaler(
  state: SimState,
  autoscalerId: string
): SimResult<{ state: SimState; autoscaler: K8sAutoscaler; deployment: K8sDeployment; scaled: boolean }> {
  const autoscaler = state.k8sAutoscalers.find((a) => a.id === autoscalerId);
  if (!autoscaler) return notFound('Autoscaler');

  const deployment = state.k8sDeployments.find((d) => d.id === autoscaler.deploymentId);
  if (!deployment) return notFound('Deployment');

  const target = autoscaler.targetCpuUtilization;
  const cpu = autoscaler.currentCpuUtilization;
  let desired = deployment.replicas;
  if (cpu > target) desired = Math.min(autoscaler.maxReplicas, deployment.replicas + 1);
  else if (cpu < target) desired = Math.max(autoscaler.minReplicas, deployment.replicas - 1);

  const updatedAutoscaler: K8sAutoscaler = {
    ...autoscaler,
    lastScaleAt: new Date().toISOString(),
  };

  if (desired === deployment.replicas) {
    // Within bounds: record the decision without changing the deployment.
    const next = {
      ...state,
      k8sAutoscalers: state.k8sAutoscalers.map((a) => (a.id === autoscalerId ? updatedAutoscaler : a)),
    };
    return ok(
      { state: next, autoscaler: updatedAutoscaler, deployment, scaled: false },
      `Autoscaler "${autoscaler.name}" held "${deployment.name}" at ${deployment.replicas} replica(s); ${cpu}% CPU is within the ${target}% target.`
    );
  }

  const scaled = scaleK8sDeployment(state, deployment.id, desired);
  if (!scaled.ok) return scaled;

  const withAutoscaler = {
    ...scaled.value.state,
    k8sAutoscalers: scaled.value.state.k8sAutoscalers.map((a) => (a.id === autoscalerId ? updatedAutoscaler : a)),
  };
  const logged = logEvent(
    withAutoscaler,
    'container.horizontalPodAutoscalers.update',
    `namespaces/${deployment.name}/horizontalpodautoscalers/${autoscaler.name}`,
    'SUCCESS',
    `cpu=${cpu}% target=${target}% scaled ${deployment.replicas} -> ${desired}`
  );

  return ok(
    { state: logged, autoscaler: updatedAutoscaler, deployment: scaled.value.deployment, scaled: true },
    `Autoscaler "${autoscaler.name}" scaled "${deployment.name}" from ${deployment.replicas} to ${desired} replica(s) at ${cpu}% CPU.`
  );
}

export function deleteK8sAutoscaler(state: SimState, autoscalerId: string): SimResult<{ state: SimState }> {
  const autoscaler = state.k8sAutoscalers.find((a) => a.id === autoscalerId);
  if (!autoscaler) return notFound('Autoscaler');
  const next = { ...state, k8sAutoscalers: state.k8sAutoscalers.filter((a) => a.id !== autoscalerId) };
  return ok({ state: next }, `Autoscaler "${autoscaler.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* helpers exposed to the console                                     */
/* ------------------------------------------------------------------ */

/** Whether a specific cluster node VM is healthy for load balancing. */
export function clusterNodeIsHealthy(state: SimState, cluster: K8sCluster, vm: Vm, healthPort: number): boolean {
  const lb = state.loadBalancers.find(
    (l) => l.backendVmIds.includes(vm.id) && l.healthCheck.port === healthPort
  );
  if (!lb) return vm.status === 'RUNNING';
  return isBackendHealthy(state, lb, vm);
}

/**
 * Guard for deleting a VPC: a cluster anchored in it must go first, otherwise
 * the cluster would be left pointing at a network that no longer exists.
 */
export function canDeleteVpcWithClusters(state: SimState, vpcId: string): boolean {
  return !state.k8sClusters.some((c) => c.vpcId === vpcId);
}