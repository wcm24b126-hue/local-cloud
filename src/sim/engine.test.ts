import { describe, expect, it } from 'vitest';
import {
  addRule,
  allocateInternalIp,
  attachDisk,
  attachInternetGateway,
  attachNsg,
  createDisk,
  createLoadBalancer,
  createNsg,
  createRoute,
  createSubnet,
  createVm,
  createVpc,
  deleteDisk,
  deleteSubnet,
  deleteVpc,
  detachDisk,
  detachInternetGateway,
  setVmRunning,
  validateName,
} from './engine';
import { createInitialState } from './engine';
import { buildRouteTable, selectRoute } from './packetTracer';
import { buildSampleNetwork, verifyDemoTraces } from './seed';
import { SimOk, SimResult, SimState, Subnet } from './types';

/** Assert a SimResult succeeded and narrow it so `.value` is typed. */
function expectOk<T>(result: SimResult<T>): SimOk<T> {
  if (!result.ok) throw new Error(`expected success but got: ${result.message}`);
  return result;
}

interface Scaffold {
  state: SimState;
  vpcId: string;
  subnets: Record<string, string>;
}

/**
 * Add a VPC plus three subnets to an existing state.
 *
 * `prefix` keeps subnet names unique so several VPCs can coexist in one state.
 */
function addScaffold(state: SimState, vpcName: string, cidrBase: string, prefix = ''): Scaffold {
  const vpc = expectOk(createVpc(state, { name: vpcName }));
  let next = vpc.value.state;

  const subnets: Record<string, string> = {};
  const parts = cidrBase.split('.');
  const suffixes = ['web-subnet', 'app-subnet', 'db-subnet'];
  for (const [index, suffix] of suffixes.entries()) {
    const cidr = `${parts[0]}.${parts[1]}.${Number(parts[2]) + index}.0/24`;
    const created = expectOk(createSubnet(next, { name: `${prefix}${suffix}`, vpcId: vpc.value.vpc.id, cidr }));
    next = created.value.state;
    subnets[suffix] = created.value.subnet.id;
  }

  return { state: next, vpcId: vpc.value.vpc.id, subnets };
}

/** Build a fresh state containing one VPC with three subnets. */
function scaffold(): Scaffold {
  return addScaffold(createInitialState(), 'test-vpc', '10.0.1');
}

describe('name validation', () => {
  it('accepts valid GCP-style names', () => {
    expect(validateName('web-1', 'VM instance')).toBeNull();
    expect(validateName('a', 'VM instance')).toBeNull();
    expect(validateName('my-resource-2024', 'VPC network')).toBeNull();
  });

  it('rejects invalid names with a helpful message', () => {
    expect(validateName('', 'VM instance')).not.toBeNull();
    expect(validateName('-leading', 'VM instance')).not.toBeNull();
    expect(validateName('trailing-', 'VM instance')).not.toBeNull();
    expect(validateName('Upper', 'VM instance')).not.toBeNull();
    expect(validateName('under_score', 'VM instance')).not.toBeNull();
    expect(validateName('1starts-with-digit', 'VM instance')).not.toBeNull();
    expect(validateName('a'.repeat(64), 'VM instance')).not.toBeNull();
  });

  it('explains how to fix each rejection', () => {
    const error = validateName('-bad', 'VM instance');
    expect(error?.howToFix).toContain('lowercase');
  });
});

describe('subnet CIDR validation', () => {
  it('rejects a malformed CIDR', () => {
    const { state, vpcId } = scaffold();
    const result = createSubnet(state, { name: 'bad', vpcId, cidr: 'not-a-cidr' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_CIDR');
  });

  it('rejects a prefix outside /8 - /29', () => {
    const { state, vpcId } = scaffold();
    const result = createSubnet(state, { name: 'too-big', vpcId, cidr: '10.9.0.0/30' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CIDR_OUT_OF_RANGE');
  });

  it('rejects an overlapping subnet and names the conflict', () => {
    const { state, vpcId } = scaffold();
    const result = createSubnet(state, { name: 'overlap', vpcId, cidr: '10.0.1.0/25' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CIDR_OVERLAP');
      expect(result.message).toContain('web-subnet');
      expect(result.howToFix).toContain('10.0.1.0/24');
    }
  });

  it('rejects a public range unless explicitly allowed', () => {
    const { state, vpcId } = scaffold();
    const rejected = createSubnet(state, { name: 'public', vpcId, cidr: '8.8.8.0/24' });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe('CIDR_NOT_PRIVATE');

    const allowed = createSubnet(state, { name: 'public', vpcId, cidr: '8.8.8.0/24', allowPublicRange: true });
    expect(allowed.ok).toBe(true);
  });

  it('normalises the stored CIDR to its network address', () => {
    const { state, vpcId } = scaffold();
    const result = createSubnet(state, { name: 'sloppy', vpcId, cidr: '10.0.9.42/24' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.subnet.cidr).toBe('10.0.9.0/24');
      expect(result.value.subnet.gatewayIp).toBe('10.0.9.1');
    }
  });

  it('rejects duplicate subnet names', () => {
    const { state, vpcId } = scaffold();
    const result = createSubnet(state, { name: 'web-subnet', vpcId, cidr: '10.0.9.0/24' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('DUPLICATE_NAME');
  });
});

describe('internal IP allocation', () => {
  it('skips the reserved network, gateway and broadcast addresses', () => {
    const subnet: Subnet = {
      id: 's1',
      name: 'test',
      vpcId: 'v1',
      region: 'us-central1',
      cidr: '10.0.1.0/29',
      gatewayIp: '10.0.1.1',
      usedIps: [],
      status: 'READY',
      createdAt: '',
    };

    expect(allocateInternalIp(subnet, [])).toBe('10.0.1.2');
    expect(allocateInternalIp(subnet, ['10.0.1.2'])).toBe('10.0.1.3');
    expect(allocateInternalIp(subnet, ['10.0.1.2', '10.0.1.3', '10.0.1.4'])).toBe('10.0.1.5');
  });

  it('returns null when the subnet is exhausted', () => {
    const subnet: Subnet = {
      id: 's1',
      name: 'test',
      vpcId: 'v1',
      region: 'us-central1',
      cidr: '10.0.1.0/29',
      gatewayIp: '10.0.1.1',
      usedIps: [],
      status: 'READY',
      createdAt: '',
    };

    const all = ['10.0.1.2', '10.0.1.3', '10.0.1.4', '10.0.1.5', '10.0.1.6'];
    expect(allocateInternalIp(subnet, all)).toBeNull();
  });

  it('allocates sequentially across VMs in a subnet', () => {
    const { state: base, subnets } = scaffold();
    let state = base;

    const ips: string[] = [];
    for (const name of ['vm-a', 'vm-b', 'vm-c']) {
      const created = expectOk(createVm(state, { name, subnetId: subnets['web-subnet'] as string }));
      state = created.value.state;
      ips.push(created.value.vm.internalIp);
    }

    expect(ips).toEqual(['10.0.1.2', '10.0.1.3', '10.0.1.4']);
    expect(state.vms).toHaveLength(3);
  });
});

describe('VM creation', () => {
  it('requires an existing READY subnet', () => {
    const { state } = scaffold();
    const result = createVm(state, { name: 'orphan', subnetId: 'does-not-exist' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('auto-creates a boot disk', () => {
    let state = scaffold().state;
    const { subnets } = scaffold();
    const created = expectOk(createVm(state, { name: 'vm-a', subnetId: subnets['web-subnet'] as string }));
    state = created.value.state;

    const bootDisks = state.disks.filter((d) => d.isBootDisk);
    expect(bootDisks).toHaveLength(1);
    expect(bootDisks[0]?.attachedVmId).toBe(created.value.vm.id);
    expect(created.value.vm.diskIds).toContain(bootDisks[0]?.id);
  });

  it('refuses an external IP when no Internet Gateway is attached', () => {
    const { state, subnets } = scaffold();
    const result = createVm(state, {
      name: 'vm-a',
      subnetId: subnets['web-subnet'] as string,
      withExternalIp: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_STATE');
      expect(result.howToFix).toContain('Internet Gateway');
    }
  });

  it('assigns an external IP once a gateway exists', () => {
    const { state: base, vpcId, subnets } = scaffold();
    const state = expectOk(attachInternetGateway(base, { name: 'igw', vpcId })).value.state;
    const created = expectOk(
      createVm(state, { name: 'vm-a', subnetId: subnets['web-subnet'] as string, withExternalIp: true })
    );
    expect(created.value.vm.externalIp).toBeTruthy();
  });

  it('reports IP exhaustion clearly', () => {
    let state = createInitialState();
    const vpc = expectOk(createVpc(state, { name: 'tiny-vpc' }));
    state = vpc.value.state;
    const subnet = expectOk(
      createSubnet(state, { name: 'tiny-subnet', vpcId: vpc.value.vpc.id, cidr: '10.0.1.0/29' })
    );
    state = subnet.value.state;

    // /29 leaves exactly 5 usable addresses (10.0.1.2 - 10.0.1.6).
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      state = expectOk(createVm(state, { name, subnetId: subnet.value.subnet.id })).value.state;
    }

    const overflow = createVm(state, { name: 'f', subnetId: subnet.value.subnet.id });
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) {
      expect(overflow.code).toBe('IP_EXHAUSTED');
      expect(overflow.howToFix).toContain('/22');
    }
  });
});

describe('disk lifecycle', () => {
  it('attaches only in the same zone and only when free', () => {
    const { state: base, subnets } = scaffold();
    const vm = expectOk(createVm(base, { name: 'vm-a', subnetId: subnets['web-subnet'] as string }));
    const afterVm = vm.value.state;

    const disk = expectOk(createDisk(afterVm, { name: 'data-1', zone: 'us-central1-a', sizeGb: 50 }));
    const afterDisk = disk.value.state;

    const attached = expectOk(attachDisk(afterDisk, disk.value.disk.id, vm.value.vm.id));
    const state = attached.value.state;
    expect(state.disks.find((d) => d.id === disk.value.disk.id)?.attachedVmId).toBe(vm.value.vm.id);

    // Attaching twice must fail.
    const again = attachDisk(state, disk.value.disk.id, vm.value.vm.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('INVALID_STATE');

    // A disk in another zone must be rejected.
    const otherZoneDisk = expectOk(createDisk(state, { name: 'data-2', zone: 'us-east1-b' }));
    const wrongZone = attachDisk(otherZoneDisk.value.state, otherZoneDisk.value.disk.id, vm.value.vm.id);
    expect(wrongZone.ok).toBe(false);
    if (!wrongZone.ok) expect(wrongZone.message).toContain('zone');
  });

  it('blocks deleting an attached disk', () => {
    const { state: base, subnets } = scaffold();
    const vm = expectOk(createVm(base, { name: 'vm-a', subnetId: subnets['web-subnet'] as string }));
    const disk = expectOk(createDisk(vm.value.state, { name: 'data-1' }));
    const state = expectOk(attachDisk(disk.value.state, disk.value.disk.id, vm.value.vm.id)).value.state;

    const blocked = deleteDisk(state, disk.value.disk.id);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('DEPENDENCY');
  });

  it('refuses to detach a boot disk', () => {
    const { state: base, subnets } = scaffold();
    const state = expectOk(createVm(base, { name: 'vm-a', subnetId: subnets['web-subnet'] as string })).value.state;

    const bootDisk = state.disks.find((d) => d.isBootDisk);
    expect(bootDisk).toBeDefined();

    const result = detachDisk(state, bootDisk?.id ?? '');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('boot disk');
  });
});

describe('internet gateway and routes', () => {
  it('allows only one gateway per VPC and adds the default route', () => {
    const base = scaffold();
    const first = expectOk(attachInternetGateway(base.state, { name: 'igw-1', vpcId: base.vpcId }));
    expect(first.value.state.routes.some((r) => r.destCidr === '0.0.0.0/0' && r.nextHop === 'internet-gateway')).toBe(
      true
    );

    const second = attachInternetGateway(first.value.state, { name: 'igw-2', vpcId: base.vpcId });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('INVALID_STATE');
  });

  it('removes the default route on detach', () => {
    const base = scaffold();
    const gateway = expectOk(attachInternetGateway(base.state, { name: 'igw-1', vpcId: base.vpcId }));
    const state = expectOk(detachInternetGateway(gateway.value.state, gateway.value.gateway.id)).value.state;
    expect(state.routes.filter((r) => r.destCidr === '0.0.0.0/0')).toHaveLength(0);
  });
});

describe('longest prefix match', () => {
  it('prefers the more specific route', () => {
    const base = scaffold();
    const { vpcId } = base;
    let state = expectOk(attachInternetGateway(base.state, { name: 'igw', vpcId })).value.state;
    state = expectOk(
      createRoute(state, {
        name: 'office-route',
        vpcId,
        destCidr: '203.0.113.0/24',
        nextHop: 'vm',
        priority: 900,
      })
    ).value.state;

    const table = buildRouteTable(state, vpcId);
    const chosen = selectRoute(table, '203.0.113.7');
    expect(chosen?.name).toBe('office-route');

    const other = selectRoute(table, '8.8.8.8');
    expect(other?.destCidr).toBe('0.0.0.0/0');
  });

  it('breaks ties with the lowest priority number', () => {
    const routes = [
      {
        id: 'r1',
        vpcId: 'v1',
        name: 'second',
        destCidr: '10.5.0.0/16',
        nextHop: 'local' as const,
        priority: 2000,
        isImplicit: false,
        createdAt: '',
      },
      {
        id: 'r2',
        vpcId: 'v1',
        name: 'first',
        destCidr: '10.5.0.0/16',
        nextHop: 'local' as const,
        priority: 500,
        isImplicit: false,
        createdAt: '',
      },
    ];
    expect(selectRoute(routes, '10.5.1.1')?.name).toBe('first');
  });

  it('returns undefined when nothing matches', () => {
    expect(selectRoute([], '10.0.0.1')).toBeUndefined();
  });
});

describe('firewall policy rules', () => {
  it('rejects duplicate priorities within a direction', () => {
    const { state: base, vpcId } = scaffold();
    const nsg = expectOk(createNsg(base, { name: 'test-nsg', vpcId }));

    const state = expectOk(
      addRule(nsg.value.state, nsg.value.nsg.id, {
        name: 'rule-a',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'tcp',
        portRange: '80',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).value.state;

    const clash = addRule(state, nsg.value.nsg.id, {
      name: 'rule-b',
      direction: 'ingress',
      action: 'allow',
      priority: 1000,
      protocol: 'tcp',
      portRange: '443',
      sourceCidr: '0.0.0.0/0',
      destCidr: '0.0.0.0/0',
      description: '',
    });
    expect(clash.ok).toBe(false);
  });

  it('rejects an out-of-range priority', () => {
    const { state, vpcId } = scaffold();
    const nsg = expectOk(createNsg(state, { name: 'test-nsg', vpcId }));
    const result = addRule(nsg.value.state, nsg.value.nsg.id, {
      name: 'bad-priority',
      direction: 'ingress',
      action: 'allow',
      priority: 70000,
      protocol: 'tcp',
      portRange: '80',
      sourceCidr: '0.0.0.0/0',
      destCidr: '0.0.0.0/0',
      description: '',
    });
    expect(result.ok).toBe(false);
  });

  it('refuses to attach a policy to a resource in another VPC', () => {
    const main = scaffold();
    const other = addScaffold(main.state, 'other-vpc', '10.5.1', 'other-');
    const otherVm = expectOk(createVm(other.state, { name: 'other-vm', subnetId: other.subnets['web-subnet'] as string }));

    const nsg = expectOk(createNsg(otherVm.value.state, { name: 'cross-vpc', vpcId: main.vpcId }));
    const result = attachNsg(nsg.value.state, nsg.value.nsg.id, { vmIds: [otherVm.value.vm.id] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_STATE');
  });
});

describe('dependency-aware deletion', () => {
  it('blocks deleting a VPC that still has subnets', () => {
    const { state, vpcId } = scaffold();
    const blocked = deleteVpc(state, vpcId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe('DEPENDENCY');
      expect(blocked.message).toContain('subnet');
      expect(blocked.howToFix).toContain('Delete with dependencies');
    }
  });

  it('cascades when explicitly asked', () => {
    const { state, vpcId } = scaffold();
    const result = deleteVpc(state, vpcId, { cascade: true });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.state.subnets).toHaveLength(0);
  });

  it('blocks deleting a subnet that still has VMs', () => {
    let state = scaffold().state;
    const { subnets } = scaffold();
    state = expectOk(createVm(state, { name: 'vm-a', subnetId: subnets['web-subnet'] as string })).value.state;

    const blocked = deleteSubnet(state, subnets['web-subnet'] as string);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toContain('vm-a');
  });

  it('deletes an empty subnet', () => {
    const { state, subnets } = scaffold();
    const result = deleteSubnet(state, subnets['db-subnet'] as string);
    expect(result.ok).toBe(true);
  });
});

describe('VM power state', () => {
  it('stops and starts a VM, and rejects redundant transitions', () => {
    const { state: base, subnets } = scaffold();
    const vm = expectOk(createVm(base, { name: 'vm-a', subnetId: subnets['web-subnet'] as string }));
    let state = expectOk(setVmRunning(vm.value.state, vm.value.vm.id, false)).value.state;
    expect(state.vms[0]?.status).toBe('TERMINATED');

    const redundant = setVmRunning(state, vm.value.vm.id, false);
    expect(redundant.ok).toBe(false);

    state = expectOk(setVmRunning(state, vm.value.vm.id, true)).value.state;
    expect(state.vms[0]?.status).toBe('RUNNING');
  });
});

describe('load balancer creation', () => {
  it('rejects backends from a different VPC', () => {
    const main = scaffold();
    const other = addScaffold(main.state, 'other-vpc', '10.6.1', 'other-');
    const otherVm = expectOk(
      createVm(other.state, { name: 'other-vm', subnetId: other.subnets['web-subnet'] as string })
    );

    const result = createLoadBalancer(otherVm.value.state, {
      name: 'bad-lb',
      type: 'external-http',
      vpcId: main.vpcId,
      port: 80,
      backendVmIds: [otherVm.value.vm.id],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_STATE');
  });

  it('assigns a unique frontend IP', () => {
    const { state: base, vpcId } = scaffold();
    const first = expectOk(createLoadBalancer(base, { name: 'lb-a', type: 'external-http', vpcId, port: 80 }));
    const second = expectOk(
      createLoadBalancer(first.value.state, { name: 'lb-b', type: 'external-http', vpcId, port: 8080 })
    );
    expect(first.value.lb.frontendIp).not.toBe(second.value.lb.frontendIp);
  });
});

describe('demo scenario', () => {
  it('builds the whole sample network without errors', () => {
    const state = buildSampleNetwork();
    expect(state.vpcs).toHaveLength(1);
    expect(state.subnets).toHaveLength(3);
    expect(state.vms).toHaveLength(3);
    expect(state.disks.length).toBeGreaterThanOrEqual(4);
    expect(state.gateways).toHaveLength(1);
    expect(state.loadBalancers).toHaveLength(1);
    expect(state.nsgs).toHaveLength(2);
  });

  it('matches the IPs the spec expects', () => {
    const state = buildSampleNetwork();
    const byName = (name: string) => state.vms.find((vm) => vm.name === name);

    expect(byName('web-1')?.internalIp).toBe('10.0.1.2');
    expect(byName('app-1')?.internalIp).toBe('10.0.2.2');
    expect(byName('db-1')?.internalIp).toBe('10.0.3.2');
    expect(byName('web-1')?.externalIp).toBeTruthy();
    expect(byName('app-1')?.externalIp).toBeUndefined();
  });

  it('produces all four expected demo traces', () => {
    const state = buildSampleNetwork();
    const results = verifyDemoTraces(state);
    for (const result of results) {
      expect(result.actual, `${result.label}: ${result.summary}`).toBe(result.expected);
      expect(result.pass, `${result.label}: ${result.summary}`).toBe(true);
    }
  });
});