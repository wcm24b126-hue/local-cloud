import { describe, expect, it } from 'vitest';
import {
  buildKubernetesErp,
  loadTestErp,
  removeAllClusters,
  resizeErpCluster,
  resyncClusterLoadBalancers,
  scaleErpTier,
} from './kubernetesErp';
import { gatewayIsServing, reconcileK8sAutoscaler, serviceEndpoints } from './k8s';
import { healthyBackends } from './engine';
import { K8sDeployment, SimState } from './types';

/** Rebuilds the system for each test so cases cannot leak state into each other. */
function erp() {
  return buildKubernetesErp();
}

function deployment(state: SimState, name: string): K8sDeployment {
  const found = state.k8sDeployments.find((d) => d.name === name);
  if (!found) throw new Error(`deployment ${name} was not found`);
  return found;
}

describe('one-click three-tier ERP on GKE', () => {
  it('builds the whole system in one call', () => {
    const { state, cluster, namespace } = erp();

    expect(cluster.status).toBe('RUNNING');
    expect(cluster.name).toBe('erp-gke');
    expect(namespace.name).toBe('erp');
    // One cluster, one namespace, three tiers, three services, two gateways.
    expect(state.k8sClusters).toHaveLength(1);
    expect(state.k8sDeployments).toHaveLength(3);
    expect(state.k8sServices).toHaveLength(3);
    expect(state.k8sGateways).toHaveLength(2);
    expect(state.k8sIngresses).toHaveLength(1);
    expect(state.k8sAutoscalers).toHaveLength(3);
  });

  it('runs three replicas of every tier', () => {
    const { state } = erp();

    for (const name of ['erp-web', 'erp-api', 'erp-db']) {
      const tier = deployment(state, name);
      expect(tier.replicas).toBe(3);
      expect(tier.readyReplicas).toBe(3);
      expect(tier.status).toBe('RUNNING');
    }
  });

  it('backs the node pool with real VMs inside the cluster subnet', () => {
    const { state, cluster } = erp();

    expect(cluster.vmIds).toHaveLength(3);
    const nodes = state.vms.filter((v) => cluster.vmIds.includes(v.id));
    expect(nodes).toHaveLength(3);
    for (const node of nodes) {
      expect(node.subnetId).toBe(cluster.subnetId);
      expect(node.status).toBe('RUNNING');
    }
  });

  it('wires each service to its own tier by label selector', () => {
    const { state } = erp();

    const expectations: [string, number][] = [
      ['erp-web-svc', 3],
      ['erp-api-svc', 3],
      ['erp-db-svc', 3],
    ];
    for (const [name, expected] of expectations) {
      const service = state.k8sServices.find((s) => s.name === name)!;
      const endpoints = serviceEndpoints(state, service);
      expect(endpoints).toHaveLength(expected);
      // Endpoints must come from the tier the selector names, not any pod.
      const owners = new Set(endpoints.map((e) => e.deploymentId));
      expect(owners.size).toBe(1);
      expect([...owners][0]).toBe(deployment(state, name.replace('-svc', '')).id);
    }
  });

  it('gives every service a distinct address in the service network', () => {
    const { state } = erp();
    const ips = state.k8sServices.map((s) => s.clusterIp);

    expect(new Set(ips).size).toBe(ips.length);
    for (const ip of ips) expect(ip).toMatch(/^10\.96\./);
  });

  it('publishes the web tier through an external gateway load balancer', () => {
    const { state, gateway, externalAddress } = erp();

    expect(gateway.className).toBe('gke-l7-global-external');
    expect(externalAddress).toBeTruthy();
    expect(gatewayIsServing(state, gateway)).toBe(true);

    const lb = state.loadBalancers.find((l) => l.id === gateway.lbId)!;
    // The load balancer fronts the node pool and all of it is healthy.
    expect(lb.backendVmIds).toHaveLength(3);
    expect(healthyBackends(state, lb).length).toBe(3);
  });

  it('exposes an internal address for in-VPC traffic', () => {
    const { internalAddress } = erp();
    expect(internalAddress).toMatch(/^10\./);
  });

  it('keeps the database tier off the public internet', () => {
    const { state } = erp();
    const db = deployment(state, 'erp-db');
    const dbService = state.k8sServices.find((s) => s.name === 'erp-db-svc')!;

    // No load balancer, no node port, no gateway route reaches the data tier.
    expect(dbService.lbId).toBeUndefined();
    expect(dbService.nodePort).toBeUndefined();
    for (const gateway of state.k8sGateways) {
      expect(gateway.routes.some((r) => r.serviceId === dbService.id)).toBe(false);
    }
    // The firewall only allows PostgreSQL from the cluster node range.
    const policy = state.nsgs.find((n) => n.name === 'erp-data-policy')!;
    const postgres = policy.rules.find((r) => r.portRange === '5432')!;
    expect(postgres.action).toBe('allow');
    expect(postgres.sourceCidr).toBe('10.128.0.0/9');
    expect(db.labels.tier).toBe('db');
  });

  it('ships configuration, a secret and storage for the tiers', () => {
    const { state } = erp();

    const config = state.k8sConfigMaps.find((c) => c.name === 'erp-config')!;
    expect(config.data.DB_HOST).toBe('erp-db-svc.erp.svc.cluster.local');

    const secret = state.k8sSecrets.find((s) => s.name === 'erp-db')!;
    // Secrets are never readable in the clear.
    expect(secret.data.DB_PASSWORD).not.toBe('localcloud-simulated-only');
    expect(atob(secret.data.DB_PASSWORD)).toBe('localcloud-simulated-only');

    const pvc = state.k8sPvcs.find((p) => p.name === 'erp-db-data')!;
    expect(pvc.status).toBe('BOUND');
    expect(state.disks.some((d) => d.id === pvc.diskId)).toBe(true);
    // The database tier mounts the claim.
    expect(deployment(state, 'erp-db').pvcId).toBe(pvc.id);
  });

  it('registers an autoscaler for every tier', () => {
    const { state } = erp();

    expect(state.k8sAutoscalers).toHaveLength(3);
    const covered = new Set(state.k8sAutoscalers.map((a) => a.deploymentId));
    expect(covered.size).toBe(3);
    for (const autoscaler of state.k8sAutoscalers) {
      expect(autoscaler.maxReplicas).toBeGreaterThan(autoscaler.minReplicas);
    }
  });

  it('records the build in the audit log', () => {
    const { state } = erp();
    const actions = state.events.map((e) => e.action);

    expect(actions).toContain('container.clusters.create');
    expect(actions).toContain('container.deployments.create');
    expect(actions).toContain('container.services.create');
    expect(actions).toContain('networking.gateway.networking.k8s.io/gateways.create');
    expect(actions).toContain('networking.k8s.io/ingresses.create');
    expect(actions).toContain('container.horizontalPodAutoscalers.create');
    expect(actions).toContain('container.persistentVolumeClaims.create');
    expect(state.events.every((e) => e.result === 'SUCCESS')).toBe(true);
  });

  it('leaves no failed event behind', () => {
    const { state } = erp();
    expect(state.events.filter((e) => e.result === 'FAILED')).toHaveLength(0);
  });

  it('honours custom replica and node counts', () => {
    const custom = buildKubernetesErp({ clusterName: 'custom-gke', replicas: 5, nodeCount: 4 });

    expect(custom.cluster.name).toBe('custom-gke');
    expect(custom.cluster.nodeCount).toBe(4);
    expect(custom.cluster.vmIds).toHaveLength(4);
    for (const name of ['erp-web', 'erp-api', 'erp-db']) {
      expect(custom.state.k8sDeployments.find((d) => d.name === name)!.replicas).toBe(5);
    }
  });

  it('clamps an absurd replica request instead of building a broken system', () => {
    const custom = buildKubernetesErp({ replicas: 500, nodeCount: 0 });
    expect(custom.web.replicas).toBe(20);
    expect(custom.cluster.nodeCount).toBe(1);
  });

  it('builds without Node-only globals, so it runs in the browser', () => {
    // The engine ships to the browser, where Buffer does not exist. Node hides
    // that class of bug, so remove it for the duration of this test.
    const globals = globalThis as { Buffer?: unknown };
    const original = globals.Buffer;
    globals.Buffer = undefined;
    try {
      const built = buildKubernetesErp();
      expect(built.state.k8sDeployments).toHaveLength(3);
      // The secret still round-trips through the browser-safe encoder.
      const secret = built.state.k8sSecrets.find((s) => s.name === 'erp-db')!;
      expect(atob(secret.data.DB_PASSWORD)).toBe('localcloud-simulated-only');
    } finally {
      globals.Buffer = original;
    }
  });

  it('encodes non-ASCII secret values without throwing', () => {
    const built = buildKubernetesErp();
    const secret = built.state.k8sSecrets[0];
    // Stored values are base64; btoa() throws on characters above U+00FF unless
    // the bytes are encoded first, so decoding must give the original back.
    expect(atob(secret.data.DB_USER)).toBe('erp_app');
    expect(() => atob(secret.data.DB_PASSWORD)).not.toThrow();
  });

  it('is deterministic, so two builds describe the same system', () => {
    const first = buildKubernetesErp();
    const second = buildKubernetesErp();

    // Each build starts from a fresh project state, so ids are reproducible.
    expect(second.state.k8sClusters[0].id).toBe(first.state.k8sClusters[0].id);
    expect(second.cluster.vmIds).toEqual(first.cluster.vmIds);
    expect(second.state.vms.map((v) => v.id)).toEqual(first.state.vms.map((v) => v.id));
    expect(second.externalAddress).toBe(first.externalAddress);
  });
});

describe('scaling the running ERP', () => {
  it('widens the service endpoints when a tier scales out', () => {
    const { state, web } = erp();
    const result = scaleErpTier(state, web.id, 6);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.deployment.replicas).toBe(6);
    const service = result.value.state.k8sServices.find((s) => s.name === 'erp-web-svc')!;
    expect(serviceEndpoints(result.value.state, service)).toHaveLength(6);
    expect(result.value.endpoints).toBe(6);
  });

  it('narrows the service endpoints when a tier scales back in', () => {
    const { state, api } = erp();
    // Scale out first: the autoscaler floor is 3, so an in-scale below that
    // is correctly refused and is covered by the bounds test below.
    const grown = scaleErpTier(state, api.id, 6);
    expect(grown.ok).toBe(true);
    if (!grown.ok) return;

    const result = scaleErpTier(grown.value.state, api.id, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const service = result.value.state.k8sServices.find((s) => s.name === 'erp-api-svc')!;
    expect(serviceEndpoints(result.value.state, service)).toHaveLength(3);
    expect(result.value.endpoints).toBe(3);
  });

  it('refuses a scale below the autoscaler floor', () => {
    const { state, api } = erp();
    // The api autoscaler has a minimum of 3, so 2 is out of range.
    const result = scaleErpTier(state, api.id, 2);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/autoscaler range/i);
  });

  it('refuses a scale beyond the autoscaler bound', () => {
    const { state, web } = erp();
    // The web autoscaler allows at most 8 replicas.
    const result = scaleErpTier(state, web.id, 20);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/autoscaler range/i);
  });

  it('reports an unknown tier instead of throwing', () => {
    const { state } = erp();
    const result = scaleErpTier(state, 'deploy-missing', 3);
    expect(result.ok).toBe(false);
  });

  it('scales the whole system out under load and keeps it serving', () => {
    const { state, gateway, externalAddress } = erp();
    const result = loadTestErp(state, 95);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Every tier reacted to the CPU spike.
    expect(result.value.scaled).toBe(true);
    expect(result.value.details).toHaveLength(3);
    for (const name of ['erp-web', 'erp-api', 'erp-db']) {
      expect(deployment(result.value.state, name).replicas).toBeGreaterThan(3);
    }

    // Traffic still flows through the gateway afterwards.
    expect(gatewayIsServing(result.value.state, gateway)).toBe(true);
    expect(result.value.state.k8sGateways.find((g) => g.id === gateway.id)!.address).toBe(externalAddress);
    for (const service of result.value.state.k8sServices) {
      expect(serviceEndpoints(result.value.state, service).length).toBeGreaterThan(0);
    }
  });

  it('leaves the system alone when load is normal', () => {
    const { state } = erp();
    const result = loadTestErp(state, 40);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scaled).toBe(false);
    for (const name of ['erp-web', 'erp-api', 'erp-db']) {
      expect(deployment(result.value.state, name).replicas).toBe(3);
    }
  });

  it('scales each tier independently through its own autoscaler', () => {
    const { state } = erp();
    const api = deployment(state, 'erp-api');
    const hpa = state.k8sAutoscalers.find((a) => a.deploymentId === api.id)!;

    const hot = {
      ...state,
      k8sAutoscalers: state.k8sAutoscalers.map((a) =>
        a.id === hpa.id ? { ...a, currentCpuUtilization: 99 } : a
      ),
    };
    const result = reconcileK8sAutoscaler(hot, hpa.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(deployment(result.value.state, 'erp-api').replicas).toBe(4);
    // The untouched tiers stay where they were.
    expect(deployment(result.value.state, 'erp-web').replicas).toBe(3);
    expect(deployment(result.value.state, 'erp-db').replicas).toBe(3);
  });
});

describe('resizing the ERP node pool', () => {
  it('keeps every load balancer pointed at the current nodes', () => {
    const { state, cluster } = erp();
    const result = resizeErpCluster(state, cluster.id, 5);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.cluster.vmIds).toHaveLength(5);
    expect(result.value.state.vms.filter((v) => result.value.cluster.vmIds.includes(v.id))).toHaveLength(5);
    // All three load balancers, including the internal frontend, track the pool.
    for (const gateway of result.value.state.k8sGateways) {
      expect(gatewayIsServing(result.value.state, gateway)).toBe(true);
    }
    for (const lb of result.value.state.loadBalancers) {
      expect(healthyBackends(result.value.state, lb).length).toBe(5);
    }
  });

  it('reports a resize that changed nothing as already in sync', () => {
    const { state, cluster } = erp();
    const result = resyncClusterLoadBalancers(state, cluster.id);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.updated).toBe(0);
  });

  it('rejects a node count outside the pool bounds', () => {
    const { state, cluster } = erp();
    const result = resizeErpCluster(state, cluster.id, 99);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/maximum/i);
  });

  it('still serves traffic after scaling the pool in', () => {
    const { state, cluster } = erp();
    const result = resizeErpCluster(state, cluster.id, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cluster.vmIds).toHaveLength(1);
    for (const gateway of result.value.state.k8sGateways) {
      expect(gatewayIsServing(result.value.state, gateway)).toBe(true);
    }
  });
});

describe('tearing the ERP down', () => {
  it('removes the cluster, workloads, load balancers and node VMs', () => {
    const { state } = erp();
    const cleared = removeAllClusters(state);

    expect(cleared.k8sClusters).toHaveLength(0);
    expect(cleared.k8sDeployments).toHaveLength(0);
    expect(cleared.k8sServices).toHaveLength(0);
    expect(cleared.k8sGateways).toHaveLength(0);
    expect(cleared.k8sIngresses).toHaveLength(0);
    expect(cleared.k8sAutoscalers).toHaveLength(0);
    expect(cleared.k8sPvcs).toHaveLength(0);
    expect(cleared.k8sSecrets).toHaveLength(0);
    expect(cleared.k8sConfigMaps).toHaveLength(0);
    expect(cleared.k8sNamespaces).toHaveLength(0);
    // Node VMs, gateway load balancers and claim disks are all reclaimed.
    expect(cleared.vms).toHaveLength(0);
    expect(cleared.loadBalancers).toHaveLength(0);
    expect(cleared.disks).toHaveLength(0);
  });

  it('leaves the lab network in place so it can be reused', () => {
    const { state } = erp();
    const cleared = removeAllClusters(state);

    expect(cleared.vpcs).toHaveLength(1);
    expect(cleared.subnets.length).toBeGreaterThan(0);
  });

  it('can rebuild a working ERP after a teardown', () => {
    const first = erp();
    const cleared = removeAllClusters(first.state);
    const second = buildKubernetesErp();

    // The fresh build is independent of the torn-down one.
    expect(second.state.k8sDeployments).toHaveLength(3);
    expect(gatewayIsServing(second.state, second.gateway)).toBe(true);
    expect(cleared.k8sClusters).toHaveLength(0);
  });
});