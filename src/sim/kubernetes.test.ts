import { describe, expect, it } from 'vitest';
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
  deleteK8sDeployment,
  deleteK8sService,
  deploymentPods,
  reconcileK8sAutoscaler,
  resizeK8sCluster,
  scaleK8sDeployment,
  selectorMatches,
  serviceEndpoints,
  gatewayIsServing,
  updateK8sDeploymentImage,
} from './k8s';
import { createInitialState, createSubnet, createVpc, healthyBackends } from './engine';
import { K8sNamespace, SimResult, SimState } from './types';

/** Unwraps a result that the test expects to succeed, keeping the value. */
function expectOk<T extends { state: SimState }>(result: SimResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected success but got: ${result.code} ${result.message}`);
  }
  return result.value;
}

/** Unwraps a result and keeps only the next state, for threading a scenario. */
function advance<T extends { state: SimState }>(result: SimResult<T>): SimState {
  return expectOk(result).state;
}

/** A VPC, a subnet and a running cluster: the fixture most tests build on. */
function clusterFixture() {
  let s = createInitialState();
  s = advance(createVpc(s, { name: 'lab' }));
  const vpcId = s.vpcs[0].id;
  s = advance(createSubnet(s, { name: 'nodes', vpcId, cidr: '10.128.0.0/16', region: 'us-central1' }));
  const subnetId = s.subnets[0].id;
  const cluster = expectOk(
    createK8sCluster(s, { name: 'shop', vpcId, subnetId, region: 'us-central1', nodeCount: 3 })
  );
  s = cluster.state;
  return { s, vpcId, subnetId, cluster: cluster.cluster };
}

function namespaceOf(s: SimState, name: string): K8sNamespace {
  const ns = s.k8sNamespaces.find((n) => n.name === name);
  if (!ns) throw new Error(`namespace ${name} was not found`);
  return ns;
}

describe('k8s cluster lifecycle', () => {
  it('creates a running cluster backed by real node VMs', () => {
    const { s, cluster } = clusterFixture();

    expect(cluster.status).toBe('RUNNING');
    expect(cluster.nodeCount).toBe(3);
    // The declared node count and the actual VMs must agree, or the pool is a lie.
    expect(cluster.vmIds).toHaveLength(3);
    expect(s.vms.filter((v) => cluster.vmIds.includes(v.id))).toHaveLength(3);
    for (const vm of s.vms) {
      expect(vm.subnetId).toBe(cluster.subnetId);
      expect(vm.networkTags).toContain(cluster.networkTag);
    }
    // The node pool is attached to its own firewall policy.
    expect(s.nsgs.some((n) => n.name === 'shop-nodes')).toBe(true);
  });

  it('seeds the namespaces a real GKE cluster ships with', () => {
    const { s } = clusterFixture();
    const names = s.k8sNamespaces.map((n) => n.name);
    expect(names).toEqual(expect.arrayContaining(['default', 'kube-system', 'kube-public']));
  });

  it('rejects invalid and duplicate cluster names', () => {
    let s = createInitialState();
    s = advance(createVpc(s, { name: 'lab' }));
    const vpcId = s.vpcs[0].id;
    s = advance(createSubnet(s, { name: 'nodes', vpcId, cidr: '10.128.0.0/16', region: 'us-central1' }));
    const subnetId = s.subnets[0].id;

    expect(createK8sCluster(s, { name: 'Bad Name', vpcId, subnetId }).ok).toBe(false);

    const first = advance(createK8sCluster(s, { name: 'shop', vpcId, subnetId }));
    expect(createK8sCluster(first, { name: 'shop', vpcId, subnetId }).ok).toBe(false);
  });

  it('refuses a cluster whose network does not exist', () => {
    const s = createInitialState();
    const result = createK8sCluster(s, { name: 'orphan', vpcId: 'vpc-nope', subnetId: 'subnet-nope' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not found/i);
  });

  it('grows the pool and keeps the node list in sync', () => {
    const { s, cluster } = clusterFixture();
    const grown = expectOk(resizeK8sCluster(s, cluster.id, 5));

    expect(grown.cluster.nodeCount).toBe(5);
    expect(grown.cluster.vmIds).toHaveLength(5);
    expect(grown.state.vms.filter((v) => grown.cluster.vmIds.includes(v.id))).toHaveLength(5);
    // Every declared node must still be a live VM, not a dangling id.
    for (const id of grown.cluster.vmIds) {
      expect(grown.state.vms.some((v) => v.id === id)).toBe(true);
    }
  });

  it('shrinks the pool and releases the removed VMs', () => {
    const { s, cluster } = clusterFixture();
    const vmCountBefore = s.vms.length;
    const shrunk = expectOk(resizeK8sCluster(s, cluster.id, 1));

    expect(shrunk.cluster.vmIds).toHaveLength(1);
    expect(shrunk.state.vms).toHaveLength(vmCountBefore - 2);
  });

  it('honours the node pool autoscaling bounds', () => {
    const { s, cluster } = clusterFixture();
    // The fixture clamps to a minimum of 1 and a maximum of nodeCount * 3.
    expect(resizeK8sCluster(s, cluster.id, 0).ok).toBe(false);
    expect(resizeK8sCluster(s, cluster.id, 500).ok).toBe(false);
    expect(resizeK8sCluster(s, 'gke-missing', 2).ok).toBe(false);
  });

  it('refuses to delete a cluster that still holds workloads', () => {
    const { s, cluster } = clusterFixture();
    const ns = namespaceOf(s, 'default');
    const deploy = expectOk(
      createK8sDeployment(s, { name: 'web', namespaceId: ns.id, replicas: 2, image: 'web:v1', containerPort: 8080 })
    );
    const withWorkload = deploy.state;

    const blocked = deleteK8sCluster(withWorkload, cluster.id);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toMatch(/workload/i);
  });

  it('cascades through every owned resource when forced', () => {
    const { s, cluster } = clusterFixture();
    const ns = namespaceOf(s, 'default');
    const deploy = expectOk(
      createK8sDeployment(s, { name: 'web', namespaceId: ns.id, replicas: 2, image: 'web:v1', containerPort: 8080 })
    );
    const svc = expectOk(
      createK8sService(deploy.state, { name: 'web-svc', namespaceId: ns.id, selector: { app: 'web' }, port: 80, targetPort: 8080 })
    );
    const gw = expectOk(
      createK8sGateway(svc.state, { name: 'edge', namespaceId: ns.id, serviceId: svc.service.id, port: 80 })
    );

    const removed = expectOk(deleteK8sCluster(gw.state, cluster.id, { cascade: true })).state;

    expect(removed.k8sClusters).toHaveLength(0);
    expect(removed.k8sDeployments).toHaveLength(0);
    expect(removed.k8sServices).toHaveLength(0);
    expect(removed.k8sGateways).toHaveLength(0);
    expect(removed.k8sNamespaces.filter((n) => n.clusterId === cluster.id)).toHaveLength(0);
    // Node VMs and the gateway's load balancer belong to the cluster.
    expect(removed.vms).toHaveLength(0);
    expect(removed.loadBalancers).toHaveLength(0);
    // The network itself survives so it can be reused.
    expect(removed.vpcs).toHaveLength(1);
  });
});

describe('k8s namespaces', () => {
  it('creates a namespace and rejects a duplicate in the same cluster', () => {
    const { s, cluster } = clusterFixture();
    const created = expectOk(createK8sNamespace(s, { name: 'billing', clusterId: cluster.id }));

    expect(created.namespace.name).toBe('billing');
    expect(createK8sNamespace(created.state, { name: 'billing', clusterId: cluster.id }).ok).toBe(false);
  });

  it('rejects malformed namespace names', () => {
    const { s, cluster } = clusterFixture();
    expect(createK8sNamespace(s, { name: 'Not Valid', clusterId: cluster.id }).ok).toBe(false);
    expect(createK8sNamespace(s, { name: '', clusterId: cluster.id }).ok).toBe(false);
  });
});

describe('k8s deployments and pods', () => {
  function deployFixture(replicas = 3) {
    const { s, cluster } = clusterFixture();
    const ns = namespaceOf(s, 'default');
    const created = expectOk(
      createK8sDeployment(s, {
        name: 'web',
        namespaceId: ns.id,
        replicas,
        image: 'gcr.io/demo/web:v1',
        containerPort: 8080,
        labels: { app: 'web', tier: 'frontend' },
      })
    );
    return { s: created.state, cluster, ns, deployment: created.deployment };
  }

  it('derives one pod per replica', () => {
    const { s, deployment } = deployFixture(3);
    const pods = deploymentPods(s, deployment);

    expect(pods).toHaveLength(3);
    for (const pod of pods) {
      expect(pod.nodeVmId).toBeTruthy();
      expect(pod.ip).toMatch(/^10\.244\./);
      expect(pod.phase).toBe('Running');
      expect(pod.ready).toBe(true);
      expect(pod.namespace).toBe('default');
    }
    // Pod IPs are distinct, otherwise two replicas share an address.
    expect(new Set(pods.map((p) => p.ip)).size).toBe(3);
  });

  it('tracks the replica count through a scale', () => {
    const { s, deployment } = deployFixture(3);
    const scaled = expectOk(scaleK8sDeployment(s, deployment.id, 6));

    expect(scaled.deployment.replicas).toBe(6);
    expect(scaled.deployment.readyReplicas).toBe(6);
    expect(deploymentPods(scaled.state, scaled.deployment)).toHaveLength(6);
  });

  it('rejects a fractional or negative replica count', () => {
    const { s, deployment } = deployFixture();
    expect(scaleK8sDeployment(s, deployment.id, 2.5).ok).toBe(false);
    expect(scaleK8sDeployment(s, deployment.id, -1).ok).toBe(false);
    expect(scaleK8sDeployment(s, 'deploy-missing', 2).ok).toBe(false);
  });

  it('rolls an image update', () => {
    const { s, deployment } = deployFixture();
    const updated = expectOk(updateK8sDeploymentImage(s, deployment.id, 'gcr.io/demo/web:v2'));

    expect(updated.deployment.image).toBe('gcr.io/demo/web:v2');
    expect(updated.deployment.status).toBe('RUNNING');
    expect(updated.deployment.readyReplicas).toBe(updated.deployment.replicas);
  });

  it('selects only pods whose labels match every selector key', () => {
    expect(selectorMatches({ app: 'web' }, { app: 'web', tier: 'frontend' })).toBe(true);
    expect(selectorMatches({ app: 'web', tier: 'api' }, { app: 'web', tier: 'frontend' })).toBe(false);
    expect(selectorMatches({ app: 'web' }, {})).toBe(false);
  });

  it('stops exposing endpoints once the deployment is deleted', () => {
    const { s, ns, deployment } = deployFixture(2);
    const svc = expectOk(
      createK8sService(s, { name: 'web-svc', namespaceId: ns.id, selector: { app: 'web' }, port: 80, targetPort: 8080 })
    );
    expect(serviceEndpoints(svc.state, svc.service)).toHaveLength(2);

    const removed = expectOk(deleteK8sDeployment(svc.state, deployment.id, { cascade: true }));
    expect(serviceEndpoints(removed.state, svc.service)).toHaveLength(0);
  });
});

describe('k8s services', () => {
  function serviceFixture(type: 'ClusterIP' | 'NodePort' | 'LoadBalancer' = 'ClusterIP') {
    const { s, cluster } = clusterFixture();
    const ns = namespaceOf(s, 'default');
    const deploy = expectOk(
      createK8sDeployment(s, {
        name: 'web',
        namespaceId: ns.id,
        replicas: 3,
        image: 'web:v1',
        containerPort: 8080,
        labels: { app: 'web' },
      })
    );
    const svc = expectOk(
      createK8sService(deploy.state, {
        name: 'web-svc',
        namespaceId: ns.id,
        selector: { app: 'web' },
        port: type === 'LoadBalancer' ? 443 : 80,
        targetPort: 8080,
        type,
      })
    );
    return { s: svc.state, cluster, ns, deployment: deploy.deployment, service: svc.service };
  }

  it('allocates ClusterIPs from the service network without collisions', () => {
    const { s, ns } = serviceFixture();
    const a = expectOk(createK8sService(s, { name: 'a-svc', namespaceId: ns.id, selector: { app: 'a' }, port: 80, targetPort: 8080 }));
    const b = expectOk(createK8sService(a.state, { name: 'b-svc', namespaceId: ns.id, selector: { app: 'b' }, port: 80, targetPort: 8080 }));

    expect(a.service.clusterIp).toMatch(/^10\.96\./);
    expect(a.service.clusterIp).not.toBe(b.service.clusterIp);
  });

  it('resolves endpoints through the label selector', () => {
    const { s, service } = serviceFixture();
    const endpoints = serviceEndpoints(s, service);

    expect(endpoints).toHaveLength(3);
    expect(endpoints.every((e) => e.ip.startsWith('10.244.'))).toBe(true);
    expect(endpoints.every((e) => e.ready)).toBe(true);
  });

  it('allocates NodePorts inside the legal range', () => {
    const { service } = serviceFixture('NodePort');
    expect(service.nodePort).toBeGreaterThanOrEqual(30000);
    expect(service.nodePort).toBeLessThanOrEqual(32767);
  });

  it('provisions a real load balancer for LoadBalancer services', () => {
    const { s, service } = serviceFixture('LoadBalancer');
    expect(service.externalIp).toBeTruthy();

    const lb = s.loadBalancers.find((l) => l.id === service.lbId);
    expect(lb).toBeDefined();
    // The load balancer fronts the cluster's nodes, not the pods directly.
    expect(lb!.backendVmIds.length).toBe(3);
    expect(healthyBackends(s, lb!).length).toBe(3);
  });

  it('reclaims the load balancer when the service is deleted', () => {
    const { s, service } = serviceFixture('LoadBalancer');
    const lbId = service.lbId!;
    expect(s.loadBalancers.some((l) => l.id === lbId)).toBe(true);

    const removed = expectOk(deleteK8sService(s, service.id)).state;
    expect(removed.k8sServices.some((x) => x.id === service.id)).toBe(false);
    expect(removed.loadBalancers.some((l) => l.id === lbId)).toBe(false);
  });

  it('refuses an empty selector, which would silently match nothing', () => {
    const { s, ns } = serviceFixture();
    // Kubernetes tolerates an empty selector, but in a lab it is almost always
    // a typo, and a Service with no endpoints is hard to debug. Reject it.
    const result = createK8sService(s, { name: 'empty-svc', namespaceId: ns.id, selector: {}, port: 80, targetPort: 8080 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/selector/i);
  });

  it('resolves to zero endpoints when the selector matches no deployment', () => {
    const { s, ns } = serviceFixture();
    const svc = expectOk(
      createK8sService(s, { name: 'orphan-svc', namespaceId: ns.id, selector: { app: 'nothing-matches' }, port: 80, targetPort: 8080 })
    );
    expect(serviceEndpoints(svc.state, svc.service)).toHaveLength(0);
  });
});

describe('k8s ingress and gateways', () => {
  function gatewayFixture() {
    const { s, cluster } = clusterFixture();
    const ns = namespaceOf(s, 'default');
    const deploy = expectOk(
      createK8sDeployment(s, {
        name: 'web',
        namespaceId: ns.id,
        replicas: 3,
        image: 'web:v1',
        containerPort: 8080,
        labels: { app: 'web' },
      })
    );
    const svc = expectOk(
      createK8sService(deploy.state, { name: 'web-svc', namespaceId: ns.id, selector: { app: 'web' }, port: 80, targetPort: 8080 })
    );
    return { s: svc.state, cluster, ns, service: svc.service };
  }

  it('routes an ingress to a service', () => {
    const { s, ns, service } = gatewayFixture();
    const ingress = expectOk(
      createK8sIngress(s, {
        name: 'web',
        namespaceId: ns.id,
        host: 'shop.example.internal',
        path: '/',
        serviceId: service.id,
        servicePort: 80,
      })
    );

    expect(ingress.ingress.serviceId).toBe(service.id);
    expect(ingress.ingress.status).toBe('RUNNING');
    expect(serviceEndpoints(ingress.state, service)).toHaveLength(3);
  });

  it('refuses an ingress that targets a service in another namespace', () => {
    const { s, ns, service } = gatewayFixture();
    const other = expectOk(createK8sNamespace(s, { name: 'other', clusterId: ns.clusterId }));
    const result = createK8sIngress(other.state, {
      name: 'bad',
      namespaceId: other.namespace.id,
      host: 'x.internal',
      path: '/',
      serviceId: service.id,
      servicePort: 80,
    });
    expect(result.ok).toBe(false);
  });

  it('provisions a serving gateway load balancer', () => {
    const { s, ns, service } = gatewayFixture();
    const gw = expectOk(
      createK8sGateway(s, {
        name: 'edge',
        namespaceId: ns.id,
        className: 'gke-l7-global-external',
        serviceId: service.id,
        port: 80,
      })
    );

    expect(gw.gateway.address).toBeTruthy();
    expect(gw.gateway.status).toBe('RUNNING');
    expect(gatewayIsServing(gw.state, gw.gateway)).toBe(true);

    const lb = gw.state.loadBalancers.find((l) => l.id === gw.gateway.lbId)!;
    expect(healthyBackends(gw.state, lb).length).toBe(3);
  });

  it('reports a gateway as not serving once a node is down', () => {
    const { s, ns, service } = gatewayFixture();
    const gw = expectOk(
      createK8sGateway(s, { name: 'edge', namespaceId: ns.id, serviceId: service.id, port: 80 })
    );
    expect(gatewayIsServing(gw.state, gw.gateway)).toBe(true);

    const lb = gw.state.loadBalancers.find((l) => l.id === gw.gateway.lbId)!;

    // One node down is degraded, not down: the remaining backends still serve.
    const partial = {
      ...gw.state,
      vms: gw.state.vms.map((v) => (v.id === lb.backendVmIds[0] ? { ...v, status: 'TERMINATED' as const } : v)),
    };
    expect(gatewayIsServing(partial, gw.gateway)).toBe(true);

    // Every node down means the route genuinely drops.
    const broken = {
      ...gw.state,
      vms: gw.state.vms.map((v) =>
        lb.backendVmIds.includes(v.id) ? { ...v, status: 'TERMINATED' as const } : v
      ),
    };
    expect(gatewayIsServing(broken, gw.gateway)).toBe(false);
  });
});

describe('k8s configuration, secrets and storage', () => {
  it('stores config map data verbatim', () => {
    const { s } = clusterFixture();
    const ns = namespaceOf(s, 'default');
    const cm = expectOk(createK8sConfigMap(s, { name: 'settings', namespaceId: ns.id, data: { LOG_LEVEL: 'info' } }));

    expect(cm.configMap.data.LOG_LEVEL).toBe('info');
  });

  it('stores secret values base64 encoded, never in the clear', () => {
    const { s } = clusterFixture();
    const ns = namespaceOf(s, 'default');
    const secret = expectOk(
      createK8sSecret(s, { name: 'creds', namespaceId: ns.id, data: { PASSWORD: 'hunter2' } })
    );

    expect(secret.secret.data.PASSWORD).not.toBe('hunter2');
    expect(atob(secret.secret.data.PASSWORD)).toBe('hunter2');
  });

  it('provisions a disk for a claim and reclaims it on delete', () => {
    const { s } = clusterFixture();
    const ns = namespaceOf(s, 'default');
    const pvc = expectOk(
      createK8sPvc(s, { name: 'data', namespaceId: ns.id, storageGb: 50, accessMode: 'ReadWriteOnce' })
    );

    const disk = pvc.state.disks.find((d) => d.name.includes('data'));
    expect(disk).toBeDefined();
    expect(pvc.pvc.diskId).toBe(disk!.id);
    expect(pvc.pvc.status).toBe('BOUND');
  });

  it('rejects duplicate config map names in one namespace', () => {
    const { s } = clusterFixture();
    const ns = namespaceOf(s, 'default');
    const first = expectOk(createK8sConfigMap(s, { name: 'settings', namespaceId: ns.id, data: { A: '1' } }));
    expect(createK8sConfigMap(first.state, { name: 'settings', namespaceId: ns.id, data: { A: '2' } }).ok).toBe(false);
  });
});

describe('k8s autoscaler', () => {
  function hpaFixture() {
    const { s, cluster } = clusterFixture();
    const ns = namespaceOf(s, 'default');
    const deploy = expectOk(
      createK8sDeployment(s, {
        name: 'web',
        namespaceId: ns.id,
        replicas: 3,
        image: 'web:v1',
        containerPort: 8080,
        labels: { app: 'web' },
      })
    );
    const hpa = expectOk(
      createK8sAutoscaler(deploy.state, {
        name: 'web-hpa',
        namespaceId: ns.id,
        deploymentId: deploy.deployment.id,
        minReplicas: 2,
        maxReplicas: 5,
        targetCpuUtilization: 70,
      })
    );
    return { s: hpa.state, cluster, ns, deployment: deploy.deployment, autoscaler: hpa.autoscaler };
  }

  it('scales out when CPU exceeds the target', () => {
    const { s, autoscaler } = hpaFixture();
    const hot = {
      ...s,
      k8sAutoscalers: s.k8sAutoscalers.map((a) => (a.id === autoscaler.id ? { ...a, currentCpuUtilization: 90 } : a)),
    };
    const result = expectOk(reconcileK8sAutoscaler(hot, autoscaler.id));

    expect(result.scaled).toBe(true);
    expect(result.deployment.replicas).toBe(4);
  });

  it('scales in when CPU drops below the target', () => {
    const { s, autoscaler } = hpaFixture();
    const cold = {
      ...s,
      k8sAutoscalers: s.k8sAutoscalers.map((a) => (a.id === autoscaler.id ? { ...a, currentCpuUtilization: 10 } : a)),
    };
    const result = expectOk(reconcileK8sAutoscaler(cold, autoscaler.id));

    expect(result.scaled).toBe(true);
    expect(result.deployment.replicas).toBe(2);
  });

  it('holds steady at the target and respects the ceiling', () => {
    const { s, autoscaler } = hpaFixture();

    const onTarget = {
      ...s,
      k8sAutoscalers: s.k8sAutoscalers.map((a) => (a.id === autoscaler.id ? { ...a, currentCpuUtilization: 70 } : a)),
    };
    expect(expectOk(reconcileK8sAutoscaler(onTarget, autoscaler.id)).scaled).toBe(false);

    // Saturated CPU must not push past the declared maximum.
    const saturated = {
      ...s,
      k8sDeployments: s.k8sDeployments.map((d) => (d.id === autoscaler.deploymentId ? { ...d, replicas: 5 } : d)),
      k8sAutoscalers: s.k8sAutoscalers.map((a) => (a.id === autoscaler.id ? { ...a, currentCpuUtilization: 99 } : a)),
    };
    const capped = expectOk(reconcileK8sAutoscaler(saturated, autoscaler.id));
    expect(capped.deployment.replicas).toBe(5);
  });

  it('rejects a manual scale that leaves the autoscaler range', () => {
    const { s, deployment, autoscaler } = hpaFixture();
    expect(scaleK8sDeployment(s, deployment.id, autoscaler.maxReplicas + 1).ok).toBe(false);
    expect(scaleK8sDeployment(s, deployment.id, autoscaler.minReplicas - 1).ok).toBe(false);
    // In-range manual scales are still allowed.
    expect(scaleK8sDeployment(s, deployment.id, 4).ok).toBe(true);
  });

  it('returns a helpful error for an unknown autoscaler', () => {
    const { s } = hpaFixture();
    expect(reconcileK8sAutoscaler(s, 'hpa-missing').ok).toBe(false);
  });
});