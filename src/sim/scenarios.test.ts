/**
 * End-to-end scenario tests for the lab.
 *
 * These are the "run the whole workflow" cases: each block walks a complete
 * operator story against the simulation engine exactly as the console does, so a
 * passing run means the GUI path works too. `engine.test.ts` covers individual
 * functions; this file covers the sequences a learner actually performs.
 *
 * Stories covered:
 *   1.  Build a VPC and three-tier subnet layout by hand.
 *   2.  Create a VM, attach data disks, move a disk between VMs, delete safely.
 *   3.  Snapshot a disk and restore an equivalent disk elsewhere.
 *   4.  Instance templates, managed instance groups, autoscaling and clamping.
 *   5.  Cluster a group behind an external HTTP load balancer.
 *   6.  Split web/app/db behind internal TCP load balancing.
 *   7.  Autoscaling must keep a load balancer's backend list in step.
 *   8.  Security groups: subnet scope, priority order, deny by default.
 *   9.  The one-click three-tier ERP reference architecture.
 *  10.  Failure handling: every bad call returns an actionable error.
 */

import { describe, expect, it } from 'vitest';
import {
  addRule,
  attachDisk,
  attachInternetGateway,
  attachNsg,
  createDisk,
  createInitialState,
  createInstanceGroup,
  createInstanceTemplate,
  createLoadBalancer,
  createNsg,
  createSnapshot,
  createSubnet,
  createVm,
  createVpc,
  deleteDisk,
  deleteInstanceGroup,
  deleteInstanceTemplate,
  deleteLoadBalancer,
  deleteNsg,
  deleteSnapshot,
  deleteSubnet,
  deleteVm,
  deleteVpc,
  detachDisk,
  healthyBackends,
  pickBackend,
  resizeInstanceGroup,
  setLoadBalancerBackends,
  setVmRunning,
} from './engine';
import { evaluatePacket } from './packetTracer';
import { buildThreeTierErp, removeAllInstanceGroups, scaleGroupBehindLoadBalancers } from './referenceArchitecture';
import { LoadBalancer, Packet, SimOk, SimResult, SimState } from './types';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Assert a SimResult succeeded and narrow it so `.value` is typed. */
function expectOk<T>(result: SimResult<T>): SimOk<T> {
  if (!result.ok) throw new Error(`expected success but got: ${result.message}`);
  return result;
}

/** Assert a SimResult failed, returning its fields for a specific assertion. */
function expectFail<T>(result: SimResult<T>): { code: string; message: string; howToFix: string } {
  if (result.ok) throw new Error('expected failure but the operation succeeded');
  return { code: result.code, message: result.message, howToFix: result.howToFix };
}

/** `evaluatePacket` returns a trace, not a SimResult; this keeps call sites short. */
function allowed(state: SimState, packet: Packet): boolean {
  return evaluatePacket(state, packet).verdict === 'ALLOWED';
}

/** A packet from an internet host to a port on an internal address. */
function fromInternet(dstIp: string, dstPort: number): Packet {
  return { sourceIp: '198.51.100.30', destIp: dstIp, destPort: dstPort, protocol: 'tcp' };
}

/** A packet between two internal instances. */
function between(srcIp: string, dstIp: string, dstPort: number): Packet {
  return { sourceIp: srcIp, destIp: dstIp, destPort: dstPort, protocol: 'tcp' };
}

interface Tier {
  state: SimState;
  vpcId: string;
  web: string;
  app: string;
  db: string;
}

/**
 * The classic starting point: one VPC with the web/app/db subnet split.
 * Mirrors the shape the console's sample network teaches.
 */
function threeTierBase(cidrBase = '10.0'): Tier {
  let s = createInitialState();
  const vpc = expectOk(createVpc(s, { name: 'acme-vpc' })).value;
  s = vpc.state;

  const web = expectOk(createSubnet(s, { name: 'web-subnet', vpcId: vpc.vpc.id, cidr: `${cidrBase}.1.0/24`, allowPublicRange: true })).value;
  s = web.state;
  const app = expectOk(createSubnet(s, { name: 'app-subnet', vpcId: vpc.vpc.id, cidr: `${cidrBase}.2.0/24` })).value;
  s = app.state;
  const db = expectOk(createSubnet(s, { name: 'db-subnet', vpcId: vpc.vpc.id, cidr: `${cidrBase}.3.0/24` })).value;
  s = db.state;

  return { state: s, vpcId: vpc.vpc.id, web: web.subnet.id, app: app.subnet.id, db: db.subnet.id };
}

/**
 * Allow one port into a subnet from anywhere.
 *
 * Load balancer backends are only healthy when ingress permits the health check,
 * so any load balancer test needs this before it can assert on traffic.
 */
function openPort(state: SimState, vpcId: string, subnetId: string, policyName: string, port: string, priority = 1000): SimState {
  const policy = expectOk(createNsg(state, { name: policyName, vpcId })).value;
  let s = expectOk(attachNsg(policy.state, policy.nsg.id, { subnetIds: [subnetId] })).value.state;
  s = expectOk(
    addRule(s, policy.nsg.id, {
      name: `allow-${port}`,
      direction: 'ingress',
      action: 'allow',
      priority,
      protocol: 'tcp',
      portRange: port,
      sourceCidr: '0.0.0.0/0',
      destCidr: '0.0.0.0/0',
      description: `Open ${port} for testing.`,
    })
  ).value.state;
  return s;
}

/* ================================================================== */
/* 1. VPC and subnet layout                                           */
/* ================================================================== */

describe('scenario: laying out a VPC with tiered subnets', () => {
  it('creates a VPC with web, app and db subnets that do not overlap', () => {
    const { state, vpcId, web, app, db } = threeTierBase();

    expect(state.vpcs).toHaveLength(1);
    expect(state.vpcs[0].routingMode).toBe('regional');
    expect(state.subnets.map((s) => s.id).sort()).toEqual([web, app, db].sort());
    expect(new Set(state.subnets.map((s) => s.cidr)).size).toBe(3);
    expect(state.subnets.every((s) => s.vpcId === vpcId)).toBe(true);
  });

  it('gives every subnet a gateway address inside its own range', () => {
    const { state } = threeTierBase();

    for (const subnet of state.subnets) {
      const prefix = subnet.cidr.split('/')[0].split('.').slice(0, 3).join('.');
      expect(subnet.gatewayIp.startsWith(`${prefix}.`)).toBe(true);
    }
  });

  it('rejects an overlapping subnet and explains the conflict', () => {
    const base = threeTierBase();
    const failure = expectFail(createSubnet(base.state, { name: 'web-copy', vpcId: base.vpcId, cidr: '10.0.1.0/28' }));

    expect(failure.code).toBe('CIDR_OVERLAP');
    expect(failure.howToFix.length).toBeGreaterThan(0);
  });

  it('rejects a malformed CIDR outright', () => {
    const base = threeTierBase();
    expect(expectFail(createSubnet(base.state, { name: 'bad', vpcId: base.vpcId, cidr: 'not-a-cidr' })).code).toBeTruthy();
  });

  it('rejects an invalid name so the console never renders a broken resource', () => {
    const base = threeTierBase();
    expect(expectFail(createVm(base.state, { name: 'Web Server', subnetId: base.web })).code).toBe('INVALID_NAME');
    expect(expectFail(createVm(base.state, { name: '9lives', subnetId: base.web })).code).toBe('INVALID_NAME');
  });

  it('removes a subnet only when it is empty', () => {
    const base = threeTierBase();
    // Nothing inside yet, so this is allowed.
    const emptied = expectOk(deleteSubnet(base.state, base.db)).value.state;
    expect(emptied.subnets.some((s) => s.id === base.db)).toBe(false);

    // Recreate it, put a VM inside, and deletion must be blocked.
    const rebuilt = expectOk(createSubnet(emptied, { name: 'db-subnet', vpcId: base.vpcId, cidr: '10.0.3.0/24' })).value;
    const withVm = expectOk(createVm(rebuilt.state, { name: 'db-1', subnetId: rebuilt.subnet.id })).value;
    expect(expectFail(deleteSubnet(withVm.state, rebuilt.subnet.id)).code).toBe('DEPENDENCY');
    expect(withVm.state.subnets.some((s) => s.id === rebuilt.subnet.id)).toBe(true);

    // Emptying it makes deletion legal again.
    const gone = expectOk(deleteVm(withVm.state, withVm.vm.id)).value.state;
    expect(expectOk(deleteSubnet(gone, rebuilt.subnet.id)).ok).toBe(true);
  });

  it('deletes a VPC with everything inside it via cascade', () => {
    const base = threeTierBase();
    const withVm = expectOk(createVm(base.state, { name: 'web-1', subnetId: base.web })).value.state;
    const withDisk = expectOk(createDisk(withVm, { name: 'extra', sizeGb: 20 })).value.state;

    // Without cascade the blockers are named rather than silently removed.
    const refused = expectFail(deleteVpc(withDisk, base.vpcId));
    expect(refused.message).toMatch(/subnet/i);

    const removed = expectOk(deleteVpc(withDisk, base.vpcId, { cascade: true })).value.state;
    expect(removed.vpcs).toHaveLength(0);
    expect(removed.subnets).toHaveLength(0);
    expect(removed.vms).toHaveLength(0);
    expect(removed.disks).toHaveLength(0);
  });
});

/* ================================================================== */
/* 2. Disks: create, attach, move, detach, delete                     */
/* ================================================================== */

describe('scenario: managing persistent disks', () => {
  it('creates a disk, attaches it, and blocks a second attachment', () => {
    const base = threeTierBase();
    const a = expectOk(createVm(base.state, { name: 'web-1', subnetId: base.web })).value;
    const b = expectOk(createVm(a.state, { name: 'web-2', subnetId: base.web })).value;

    const disk = expectOk(createDisk(a.state, { name: 'shared-data', sizeGb: 100, type: 'pd-ssd' })).value;
    expect(disk.disk.attachedVmId).toBeNull();
    expect(disk.disk.sizeGb).toBe(100);

    const attached = expectOk(attachDisk(disk.state, disk.disk.id, a.vm.id)).value.state;
    expect(attached.disks.find((d) => d.id === disk.disk.id)?.attachedVmId).toBe(a.vm.id);
    expect(attached.vms.find((v) => v.id === a.vm.id)?.diskIds).toContain(disk.disk.id);

    // One disk, one VM: the second attach must fail.
    expect(expectFail(attachDisk(attached, disk.disk.id, b.vm.id)).code).toBeTruthy();
  });

  it('moves a disk between VMs by detaching first', () => {
    const base = threeTierBase();
    const a = expectOk(createVm(base.state, { name: 'web-1', subnetId: base.web })).value;
    const b = expectOk(createVm(a.state, { name: 'web-2', subnetId: base.web })).value;
    // The disk must be created from a state that already contains both VMs.
    const disk = expectOk(createDisk(b.state, { name: 'movable', sizeGb: 50 })).value;

    let s = expectOk(attachDisk(disk.state, disk.disk.id, a.vm.id)).value.state;
    s = expectOk(detachDisk(s, disk.disk.id)).value.state;

    expect(s.vms.find((v) => v.id === a.vm.id)?.diskIds).not.toContain(disk.disk.id);
    expect(s.disks.find((d) => d.id === disk.disk.id)?.attachedVmId).toBeNull();

    const moved = expectOk(attachDisk(s, disk.disk.id, b.vm.id)).value.state;
    expect(moved.vms.find((v) => v.id === b.vm.id)?.diskIds).toContain(disk.disk.id);
  });

  it('keeps a disk inside its own VPC', () => {
    const base = threeTierBase();
    const other = expectOk(createVpc(base.state, { name: 'second-vpc' })).value;
    const otherSubnet = expectOk(createSubnet(other.state, { name: 'other-subnet', vpcId: other.vpc.id, cidr: '192.168.0.0/24' })).value;
    const vmSame = expectOk(createVm(otherSubnet.state, { name: 'vm-a', subnetId: base.web })).value;
    const vmForeign = expectOk(createVm(vmSame.state, { name: 'vm-b', subnetId: otherSubnet.subnet.id })).value;
    const disk = expectOk(createDisk(vmForeign.state, { name: 'pinned', sizeGb: 10 })).value;

    expect(expectOk(attachDisk(disk.state, disk.disk.id, vmSame.vm.id)).ok).toBe(true);
    expect(expectFail(attachDisk(disk.state, disk.disk.id, vmForeign.vm.id)).code).toBeTruthy();
  });

  it('will not delete an attached disk', () => {
    const base = threeTierBase();
    const vm = expectOk(createVm(base.state, { name: 'web-1', subnetId: base.web })).value;
    const disk = expectOk(createDisk(vm.state, { name: 'in-use', sizeGb: 10 })).value;
    const attached = expectOk(attachDisk(disk.state, disk.disk.id, vm.vm.id)).value.state;

    expect(expectFail(deleteDisk(attached, disk.disk.id)).code).toBe('DEPENDENCY');

    const freed = expectOk(detachDisk(attached, disk.disk.id)).value.state;
    expect(expectOk(deleteDisk(freed, disk.disk.id)).ok).toBe(true);
    expect(freed.disks.find((d) => d.id === disk.disk.id)?.attachedVmId).toBeNull();
  });

  it('releases a VM-owned disk when the VM is deleted', () => {
    const base = threeTierBase();
    const vm = expectOk(createVm(base.state, { name: 'web-1', subnetId: base.web })).value;
    const disk = expectOk(createDisk(vm.state, { name: 'data', sizeGb: 10 })).value;
    const attached = expectOk(attachDisk(disk.state, disk.disk.id, vm.vm.id)).value.state;

    const deleted = expectOk(deleteVm(attached, vm.vm.id)).value.state;
    expect(deleted.vms.find((v) => v.id === vm.vm.id)).toBeUndefined();
    expect(deleted.disks.find((d) => d.id === disk.disk.id)?.attachedVmId).toBeNull();
  });

  it('rejects an out-of-range disk size', () => {
    const base = threeTierBase();
    expect(expectFail(createDisk(base.state, { name: 'huge', sizeGb: 0 })).code).toBe('INVALID_ARGUMENT');
    expect(expectFail(createDisk(base.state, { name: 'huge', sizeGb: 70000 })).code).toBe('INVALID_ARGUMENT');
    expect(expectFail(createDisk(base.state, { name: 'huge', sizeGb: 10.5 })).code).toBe('INVALID_ARGUMENT');
  });
});

/* ================================================================== */
/* 3. Snapshots and restore                                            */
/* ================================================================== */

describe('scenario: snapshotting and restoring disks', () => {
  it('snapshots a disk and restores an equivalent disk in another zone', () => {
    const base = threeTierBase();
    const disk = expectOk(createDisk(base.state, { name: 'erp-data', zone: 'us-central1-a', sizeGb: 500, type: 'pd-ssd' })).value;

    const snap = expectOk(createSnapshot(disk.state, { name: 'erp-data-nightly', diskId: disk.disk.id })).value;
    expect(snap.snapshot.sizeGb).toBe(500);
    expect(snap.snapshot.type).toBe('pd-ssd');
    expect(snap.snapshot.status).toBe('READY');
    expect(snap.snapshot.storageClass).toBe('STANDARD');

    // The restore carries the captured geometry to a different zone.
    const restored = expectOk(
      createDisk(snap.state, { name: 'erp-data-restored', zone: 'us-central1-c', sizeGb: snap.snapshot.sizeGb, type: snap.snapshot.type })
    ).value;
    expect(restored.disk.zone).toBe('us-central1-c');
    expect(restored.disk.attachedVmId).toBeNull();
    expect(restored.disk.sizeGb).toBe(snap.snapshot.sizeGb);
  });

  it('snapshots an attached disk, because a running instance is not a blocker', () => {
    const base = threeTierBase();
    const vm = expectOk(createVm(base.state, { name: 'db-1', subnetId: base.db })).value;
    const disk = expectOk(createDisk(vm.state, { name: 'live-data', sizeGb: 100 })).value;
    const attached = expectOk(attachDisk(disk.state, disk.disk.id, vm.vm.id)).value.state;

    const snap = expectOk(createSnapshot(attached, { name: 'live-backup', diskId: disk.disk.id })).value;
    expect(snap.snapshot.sourceDiskId).toBe(disk.disk.id);
  });

  it('refuses a missing disk and a duplicate snapshot name', () => {
    const base = threeTierBase();
    expect(expectFail(createSnapshot(base.state, { name: 'ghost', diskId: 'disk-nope' })).code).toBe('NOT_FOUND');

    const disk = expectOk(createDisk(base.state, { name: 'src', sizeGb: 10 })).value;
    const first = expectOk(createSnapshot(disk.state, { name: 'snap-one', diskId: disk.disk.id })).value;
    expect(expectFail(createSnapshot(first.state, { name: 'snap-one', diskId: disk.disk.id })).code).toBe('DUPLICATE_NAME');
  });

  it('deletes a snapshot without touching its source disk', () => {
    const base = threeTierBase();
    const disk = expectOk(createDisk(base.state, { name: 'src', sizeGb: 30 })).value;
    const snap = expectOk(createSnapshot(disk.state, { name: 'temp', diskId: disk.disk.id })).value;

    const removed = expectOk(deleteSnapshot(snap.state, snap.snapshot.id)).value.state;
    expect(removed.snapshots).toHaveLength(0);
    expect(removed.disks.some((d) => d.id === disk.disk.id)).toBe(true);
  });
});

/* ================================================================== */
/* 4. Instance templates and managed instance groups                  */
/* ================================================================== */

describe('scenario: instance templates and managed instance groups', () => {
  it('creates a template in a real subnet and clones it into a group', () => {
    const base = threeTierBase();
    const tpl = expectOk(
      createInstanceTemplate(base.state, { name: 'web-tpl', subnetId: base.web, machineType: 'e2-small', networkTags: ['web'] })
    ).value;

    expect(tpl.template.subnetId).toBe(base.web);
    expect(tpl.template.status).toBe('READY');

    const group = expectOk(createInstanceGroup(tpl.state, { name: 'web-mig', templateId: tpl.template.id, targetSize: 3, minSize: 1, maxSize: 6 })).value;

    expect(group.group.vmIds).toHaveLength(3);
    expect(group.state.vms).toHaveLength(3);
    for (const id of group.group.vmIds) {
      const vm = group.state.vms.find((v) => v.id === id)!;
      expect(vm.machineType).toBe('e2-small');
      expect(vm.networkTags).toContain('web');
      expect(vm.subnetId).toBe(base.web);
    }

    const names = group.state.vms.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.startsWith('web-mig-'))).toBe(true);
  });

  it('scales up and down, releasing addresses as instances go away', () => {
    const base = threeTierBase();
    const tpl = expectOk(createInstanceTemplate(base.state, { name: 'web-tpl', subnetId: base.web })).value;
    const group = expectOk(createInstanceGroup(tpl.state, { name: 'web-mig', templateId: tpl.template.id, targetSize: 2, minSize: 1, maxSize: 6 })).value;

    const up = expectOk(resizeInstanceGroup(group.state, group.group.id, 5)).value;
    expect(up.group.vmIds).toHaveLength(5);
    expect(new Set(up.state.vms.map((v) => v.internalIp)).size).toBe(5);

    const down = expectOk(resizeInstanceGroup(up.state, group.group.id, 2)).value;
    expect(down.group.vmIds).toHaveLength(2);
    expect(down.state.vms).toHaveLength(2);
    expect(new Set(down.state.vms.map((v) => v.internalIp)).size).toBe(2);
  });

  it('clamps a target to the autoscaling bounds instead of failing', () => {
    const base = threeTierBase();
    const tpl = expectOk(createInstanceTemplate(base.state, { name: 'web-tpl', subnetId: base.web })).value;
    const group = expectOk(createInstanceGroup(tpl.state, { name: 'web-mig', templateId: tpl.template.id, targetSize: 2, minSize: 2, maxSize: 4 })).value;

    expect(expectOk(resizeInstanceGroup(group.state, group.group.id, 99)).value.group.vmIds).toHaveLength(4);
    expect(expectOk(resizeInstanceGroup(group.state, group.group.id, 0)).value.group.vmIds).toHaveLength(2);
    expect(expectOk(resizeInstanceGroup(group.state, group.group.id, -10)).value.group.vmIds).toHaveLength(2);
  });

  it('fails a resize that would exceed the subnet capacity', () => {
    const base = threeTierBase();
    const tpl = expectOk(createInstanceTemplate(base.state, { name: 'web-tpl', subnetId: base.web })).value;
    const group = expectOk(createInstanceGroup(tpl.state, { name: 'web-mig', templateId: tpl.template.id, targetSize: 2, minSize: 1, maxSize: 300 })).value;

    const failure = expectFail(resizeInstanceGroup(group.state, group.group.id, 300));
    expect(failure.howToFix.length).toBeGreaterThan(0);
  });

  it('validates group bounds and template existence', () => {
    const base = threeTierBase();
    const tpl = expectOk(createInstanceTemplate(base.state, { name: 'web-tpl', subnetId: base.web })).value;

    expect(expectFail(createInstanceGroup(tpl.state, { name: 'g', templateId: 'nope' })).code).toBe('NOT_FOUND');
    expect(expectFail(createInstanceGroup(tpl.state, { name: 'g', templateId: tpl.template.id, minSize: 5, maxSize: 2 })).code).toBe('INVALID_ARGUMENT');
    expect(expectFail(createInstanceGroup(tpl.state, { name: 'g', templateId: tpl.template.id, targetSize: 10, minSize: 1, maxSize: 5 })).code).toBe('INVALID_ARGUMENT');
  });

  it('keeps a template alive while a group depends on it', () => {
    const base = threeTierBase();
    const tpl = expectOk(createInstanceTemplate(base.state, { name: 'web-tpl', subnetId: base.web })).value;
    const group = expectOk(createInstanceGroup(tpl.state, { name: 'web-mig', templateId: tpl.template.id, targetSize: 1, minSize: 1, maxSize: 3 })).value;

    expect(expectFail(deleteInstanceTemplate(group.state, tpl.template.id)).code).toBe('DEPENDENCY');

    const cleared = expectOk(deleteInstanceGroup(group.state, group.group.id)).value.state;
    expect(expectOk(deleteInstanceTemplate(cleared, tpl.template.id)).ok).toBe(true);
  });

  it('deletes a group with its instances but leaves unmanaged VMs alone', () => {
    const base = threeTierBase();
    const tpl = expectOk(createInstanceTemplate(base.state, { name: 'web-tpl', subnetId: base.web })).value;
    const group = expectOk(createInstanceGroup(tpl.state, { name: 'web-mig', templateId: tpl.template.id, targetSize: 3, minSize: 1, maxSize: 6 })).value;
    const manual = expectOk(createVm(group.state, { name: 'bastion', subnetId: base.web })).value;

    const removed = expectOk(deleteInstanceGroup(manual.state, group.group.id)).value.state;

    expect(removed.vms.map((v) => v.name)).toEqual(['bastion']);
    expect(removed.instanceGroups).toHaveLength(0);
  });

  it('removes every group in one pass, keeping the network', () => {
    const arch = buildThreeTierErp();
    const cleared = removeAllInstanceGroups(arch.state);

    expect(cleared.instanceGroups).toHaveLength(0);
    expect(cleared.vms).toHaveLength(0);
    expect(cleared.vpcs).toHaveLength(1);
    expect(cleared.subnets).toHaveLength(3);
  });
});

/* ================================================================== */
/* 5. Load balancing an autoscaled group (external HTTP)              */
/* ================================================================== */

describe('scenario: clustering a group behind an external HTTP load balancer', () => {
  /** A web group behind a load balancer whose health check can reach the tier. */
  function clustered(size = 3) {
    const base = threeTierBase();
    const tpl = expectOk(createInstanceTemplate(base.state, { name: 'web-tpl', subnetId: base.web })).value;
    const group = expectOk(createInstanceGroup(tpl.state, { name: 'web-mig', templateId: tpl.template.id, targetSize: size, minSize: 1, maxSize: 6 })).value;

    // The load balancer's own health check must be allowed in, or every backend
    // is correctly reported unhealthy.
    const opened = openPort(group.state, base.vpcId, base.web, 'web-policy', '80');
    const lb = expectOk(
      createLoadBalancer(opened, {
        name: 'web-lb',
        type: 'external-http',
        vpcId: base.vpcId,
        port: 80,
        backendVmIds: group.group.vmIds,
        healthCheckPort: 80,
      })
    ).value;

    return { base, group, lb };
  }

  it('round-robins across the whole group', () => {
    const { lb } = clustered(3);
    expect(lb.lb.type).toBe('external-http');
    expect(lb.lb.frontendIp).toMatch(/^\d+\.\d+\.\d+\.\d+$/);

    const healthy = healthyBackends(lb.state, lb.lb);
    expect(healthy).toHaveLength(3);

    const hits = ['198.51.100.5', '198.51.100.6', '198.51.100.7'].map((ip) => pickBackend(lb.lb, healthy, ip)?.id);
    expect(new Set(hits).size).toBe(3);
  });

  it('skips a stopped instance, and recovers when it starts again', () => {
    const { group, lb } = clustered(3);
    const victim = group.group.vmIds[0];

    const stopped = expectOk(setVmRunning(lb.state, victim, false)).value.state;
    expect(healthyBackends(stopped, lb.lb)).toHaveLength(2);

    const restarted = expectOk(setVmRunning(stopped, victim, true)).value.state;
    expect(healthyBackends(restarted, lb.lb)).toHaveLength(3);
  });

  it('reports every backend unhealthy when the health check is blocked', () => {
    const base = threeTierBase();
    const tpl = expectOk(createInstanceTemplate(base.state, { name: 'web-tpl', subnetId: base.web })).value;
    const group = expectOk(createInstanceGroup(tpl.state, { name: 'web-mig', templateId: tpl.template.id, targetSize: 2, minSize: 1, maxSize: 4 })).value;

    // No firewall rule at all: ingress denies by default.
    const lb = expectOk(
      createLoadBalancer(group.state, { name: 'web-lb', type: 'external-http', vpcId: base.vpcId, port: 80, backendVmIds: group.group.vmIds, healthCheckPort: 80 })
    ).value;

    expect(healthyBackends(lb.state, lb.lb)).toHaveLength(0);
    expect(pickBackend(lb.lb, healthyBackends(lb.state, lb.lb), '198.51.100.5')).toBeNull();
  });

  it('keeps the backend list in step when the group scales', () => {
    const { group, lb } = clustered(2);
    const scaled = expectOk(scaleGroupBehindLoadBalancers(lb.state, group.group.id, 6)).value;
    const rebinding = scaled.state.loadBalancers.find((l) => l.name === 'web-lb')!;

    expect(rebinding.backendVmIds).toHaveLength(6);
    expect(healthyBackends(scaled.state, rebinding)).toHaveLength(6);

    const shrunk = expectOk(scaleGroupBehindLoadBalancers(scaled.state, group.group.id, 2)).value;
    const after = shrunk.state.loadBalancers.find((l) => l.name === 'web-lb')!;
    expect(after.backendVmIds).toHaveLength(2);
    // No dangling references survive a scale-down.
    expect(after.backendVmIds.every((id) => shrunk.state.vms.some((v) => v.id === id))).toBe(true);
  });

  it('drops a deleted instance from every backend list', () => {
    const { group, lb } = clustered(3);
    const removed = expectOk(deleteVm(lb.state, group.group.vmIds[2])).value.state;
    const rebinding = removed.loadBalancers.find((l) => l.name === 'web-lb')!;

    expect(rebinding.backendVmIds).toHaveLength(2);
    expect(rebinding.backendVmIds).not.toContain(group.group.vmIds[2]);
  });

  it('deletes the load balancer without touching its instances', () => {
    const { lb } = clustered(2);
    const removed = expectOk(deleteLoadBalancer(lb.state, lb.lb.id)).value.state;

    expect(removed.loadBalancers).toHaveLength(0);
    expect(removed.vms).toHaveLength(2);
  });

  it('rejects a duplicate load balancer name and an out-of-range port', () => {
    const { lb } = clustered(1);
    expect(expectFail(createLoadBalancer(lb.state, { name: 'web-lb', type: 'external-http', vpcId: lb.lb.vpcId, port: 80 })).code).toBe('DUPLICATE_NAME');
    expect(expectFail(createLoadBalancer(lb.state, { name: 'other', type: 'internal-tcp', vpcId: lb.lb.vpcId, port: 99999 })).code).toBe('INVALID_ARGUMENT');
  });

  it('refuses a backend from another VPC', () => {
    const { base, lb } = clustered(1);
    const other = expectOk(createVpc(lb.state, { name: 'elsewhere' })).value;
    const foreignSubnet = expectOk(createSubnet(other.state, { name: 'foreign', vpcId: other.vpc.id, cidr: '192.168.5.0/24' })).value;
    const foreignVm = expectOk(createVm(foreignSubnet.state, { name: 'foreign-vm', subnetId: foreignSubnet.subnet.id })).value;

    const failure = expectFail(
      createLoadBalancer(foreignSubnet.state, { name: 'mixed', type: 'external-http', vpcId: base.vpcId, port: 8080, backendVmIds: [foreignVm.vm.id] })
    );
    expect(failure.code).toBeTruthy();
  });
});

/* ================================================================== */
/* 6. Internal TCP load balancing between tiers                       */
/* ================================================================== */

describe('scenario: splitting web, app and db behind internal load balancing', () => {
  it('gives the public tier an internet address and the private tier an internal one', () => {
    const arch = buildThreeTierErp({ webSize: 2, appSize: 2 });
    const s = arch.state;

    const webLb = s.loadBalancers.find((l) => l.name === 'web-lb')!;
    const dbLb = s.loadBalancers.find((l) => l.name === 'db-lb')!;

    expect(webLb.type).toBe('external-http');
    expect(webLb.frontendIp.startsWith('35.190.')).toBe(true);
    expect(dbLb.type).toBe('internal-tcp');
    expect(dbLb.frontendIp.startsWith('10.10.')).toBe(true);
    expect(webLb.frontendIp).not.toBe(dbLb.frontendIp);
  });

  it('gives an internal frontend no external IP behind it', () => {
    const arch = buildThreeTierErp();
    const internal = arch.state.loadBalancers.find((l) => l.type === 'internal-tcp')!;

    expect(internal.frontendIp).toMatch(/^10\./);
    expect(internal.backendVmIds.length).toBeGreaterThan(0);
  });

  it('fans each frontend out across its own tier only', () => {
    const arch = buildThreeTierErp({ webSize: 2, appSize: 2 });
    const s = arch.state;
    const webSubnetId = s.subnets.find((x) => x.name === 'web-subnet')!.id;
    const dbSubnetId = s.subnets.find((x) => x.name === 'db-subnet')!.id;

    const webLb = s.loadBalancers.find((l) => l.name === 'web-lb')!;
    const dbLb = s.loadBalancers.find((l) => l.name === 'db-lb')!;

    expect(new Set(healthyBackends(s, webLb).map((v) => v.subnetId))).toEqual(new Set([webSubnetId]));
    expect(new Set(healthyBackends(s, dbLb).map((v) => v.subnetId))).toEqual(new Set([dbSubnetId]));
  });

  it('allows the app tier from the web tier and denies it from the internet', () => {
    const arch = buildThreeTierErp();
    const s = arch.state;
    const web = s.vms.find((v) => v.networkTags.includes('web'))!;
    const app = s.vms.find((v) => v.networkTags.includes('app'))!;

    expect(allowed(s, between(web.internalIp, app.internalIp, 8080))).toBe(true);
    expect(allowed(s, fromInternet(app.internalIp, 8080))).toBe(false);
  });

  it('allows the database from the app tier and denies it from everything else', () => {
    const arch = buildThreeTierErp();
    const s = arch.state;
    const web = s.vms.find((v) => v.networkTags.includes('web'))!;
    const app = s.vms.find((v) => v.networkTags.includes('app'))!;
    const db = s.vms.find((v) => v.networkTags.includes('db'))!;

    expect(allowed(s, between(app.internalIp, db.internalIp, 5432))).toBe(true);
    expect(allowed(s, between(web.internalIp, db.internalIp, 5432))).toBe(false);
    expect(allowed(s, fromInternet(db.internalIp, 5432))).toBe(false);
  });

  it('serves an internet request to the web tier through the external frontend', () => {
    const arch = buildThreeTierErp({ webSize: 2, appSize: 2 });
    const s = arch.state;
    const webLb = s.loadBalancers.find((l) => l.name === 'web-lb')!;

    const trace = evaluatePacket(s, { sourceIp: '198.51.100.20', destIp: webLb.frontendIp, destPort: 80, protocol: 'tcp' });

    expect(trace.verdict).toBe('ALLOWED');
    // The last hop must be a real instance, not the frontend itself.
    const last = trace.hops[trace.hops.length - 1];
    expect(last.component).not.toBe('load-balancer');
  });

  it('blocks an internet request that the web tier does not serve', () => {
    const arch = buildThreeTierErp();
    const s = arch.state;
    const webLb = s.loadBalancers.find((l) => l.name === 'web-lb')!;

    // Port 22 is only open to the office range, not to this internet host.
    const trace = evaluatePacket(s, { sourceIp: '198.51.100.20', destIp: webLb.frontendIp, destPort: 22, protocol: 'tcp' });
    expect(trace.verdict).toBe('BLOCKED');
    expect(trace.blockedAt).toBeTruthy();
  });

  it('lets the office network reach the web tier over SSH', () => {
    const arch = buildThreeTierErp();
    const s = arch.state;
    const web = s.vms.find((v) => v.networkTags.includes('web'))!;

    expect(allowed(s, { sourceIp: '203.0.113.10', destIp: web.internalIp, destPort: 22, protocol: 'tcp' })).toBe(true);
    expect(allowed(s, { sourceIp: '203.0.113.99', destIp: web.internalIp, destPort: 22, protocol: 'tcp' })).toBe(true);
    expect(allowed(s, { sourceIp: '198.51.100.20', destIp: web.internalIp, destPort: 22, protocol: 'tcp' })).toBe(false);
  });
});

/* ================================================================== */
/* 7. Security groups / firewall policies                             */
/* ================================================================== */

describe('scenario: securing tiers with firewall policies', () => {
  it('applies a subnet-attached policy to the whole subnet', () => {
    const base = threeTierBase();
    const withTwo = expectOk(createVm(base.state, { name: 'web-1', subnetId: base.web })).value;
    const withBoth = expectOk(createVm(withTwo.state, { name: 'web-2', subnetId: base.web })).value;

    const policy = expectOk(createNsg(withBoth.state, { name: 'web-policy', vpcId: base.vpcId })).value;
    const attached = expectOk(attachNsg(policy.state, policy.nsg.id, { subnetIds: [base.web] })).value.state;

    expect(attached.nsgs.find((n) => n.id === policy.nsg.id)?.attachedSubnetIds).toContain(base.web);
    expect(attached.vms.filter((v) => v.subnetId === base.web)).toHaveLength(2);
  });

  it('evaluates rules by priority, lowest number first', () => {
    const base = threeTierBase();
    const vm = expectOk(createVm(base.state, { name: 'web-1', subnetId: base.web })).value;
    const policy = expectOk(createNsg(vm.state, { name: 'p', vpcId: base.vpcId })).value;

    let s = expectOk(attachNsg(policy.state, policy.nsg.id, { subnetIds: [base.web] })).value.state;
    s = expectOk(addRule(s, policy.nsg.id, { name: 'allow', direction: 'ingress', action: 'allow', priority: 1000, protocol: 'tcp', portRange: '80', sourceCidr: '0.0.0.0/0', destCidr: '0.0.0.0/0', description: '' })).value.state;
    // A tighter priority number wins even though it was added second.
    s = expectOk(addRule(s, policy.nsg.id, { name: 'deny', direction: 'ingress', action: 'deny', priority: 900, protocol: 'tcp', portRange: '80', sourceCidr: '0.0.0.0/0', destCidr: '0.0.0.0/0', description: '' })).value.state;

    expect(allowed(s, fromInternet(vm.vm.internalIp, 80))).toBe(false);
  });

  it('denies by default when no rule matches', () => {
    const base = threeTierBase();
    const vm = expectOk(createVm(base.state, { name: 'web-1', subnetId: base.web })).value;
    const policy = expectOk(createNsg(vm.state, { name: 'p', vpcId: base.vpcId })).value;
    const s = expectOk(attachNsg(policy.state, policy.nsg.id, { subnetIds: [base.web] })).value.state;

    expect(allowed(s, fromInternet(vm.vm.internalIp, 80))).toBe(false);
  });

  it('honours a single port, a port range and "all"', () => {
    const base = threeTierBase();
    const vm = expectOk(createVm(base.state, { name: 'web-1', subnetId: base.web })).value;
    const policy = expectOk(createNsg(vm.state, { name: 'p', vpcId: base.vpcId })).value;

    let s = expectOk(attachNsg(policy.state, policy.nsg.id, { subnetIds: [base.web] })).value.state;
    s = expectOk(addRule(s, policy.nsg.id, { name: 'range', direction: 'ingress', action: 'allow', priority: 1000, protocol: 'tcp', portRange: '8000-8100', sourceCidr: '0.0.0.0/0', destCidr: '0.0.0.0/0', description: '' })).value.state;
    s = expectOk(addRule(s, policy.nsg.id, { name: 'internal-all', direction: 'ingress', action: 'allow', priority: 1001, protocol: 'all', portRange: 'all', sourceCidr: '10.0.0.0/8', destCidr: '0.0.0.0/0', description: '' })).value.state;

    expect(allowed(s, fromInternet(vm.vm.internalIp, 8050))).toBe(true);
    expect(allowed(s, fromInternet(vm.vm.internalIp, 8999))).toBe(false);
    expect(allowed(s, between('10.0.9.9', vm.vm.internalIp, 65000))).toBe(true);
  });

  it('refuses a policy attached across VPCs', () => {
    const base = threeTierBase();
    const other = expectOk(createVpc(base.state, { name: 'other' })).value;
    const foreignPolicy = expectOk(createNsg(other.state, { name: 'foreign', vpcId: other.vpc.id })).value;

    expect(expectFail(attachNsg(foreignPolicy.state, foreignPolicy.nsg.id, { subnetIds: [base.web] })).code).toBeTruthy();
  });

  it('refuses a duplicate rule name inside one policy', () => {
    const base = threeTierBase();
    const policy = expectOk(createNsg(base.state, { name: 'p', vpcId: base.vpcId })).value;
    const rule = { name: 'r', direction: 'ingress' as const, action: 'allow' as const, priority: 1000, protocol: 'tcp' as const, portRange: '80', sourceCidr: '0.0.0.0/0', destCidr: '0.0.0.0/0', description: '' };

    const s = expectOk(addRule(policy.state, policy.nsg.id, rule)).value.state;
    expect(expectFail(addRule(s, policy.nsg.id, rule)).code).toBe('DUPLICATE_NAME');
  });

  it('blocks deletion of an attached policy unless cascaded', () => {
    const base = threeTierBase();
    const policy = expectOk(createNsg(base.state, { name: 'p', vpcId: base.vpcId })).value;
    const attached = expectOk(attachNsg(policy.state, policy.nsg.id, { subnetIds: [base.web] })).value.state;

    expect(expectFail(deleteNsg(attached, policy.nsg.id)).code).toBe('DEPENDENCY');
    expect(expectOk(deleteNsg(attached, policy.nsg.id, { cascade: true })).ok).toBe(true);
  });

  it('blocks deletion of a load balancer only when it is asked to', () => {
    const base = threeTierBase();
    const vm = expectOk(createVm(base.state, { name: 'web-1', subnetId: base.web })).value;
    const opened = openPort(vm.state, base.vpcId, base.web, 'web-policy', '80');
    const lb = expectOk(createLoadBalancer(opened, { name: 'web-lb', type: 'external-http', vpcId: base.vpcId, port: 80, backendVmIds: [vm.vm.id], healthCheckPort: 80 })).value;

    // Deleting the instance first must leave the load balancer consistent.
    const removedVm = expectOk(deleteVm(lb.state, vm.vm.id)).value.state;
    const rebinding = removedVm.loadBalancers.find((l) => l.id === lb.lb.id)!;
    expect(rebinding.backendVmIds).toHaveLength(0);
    expect(healthyBackends(removedVm, rebinding)).toHaveLength(0);
    expect(expectOk(deleteLoadBalancer(removedVm, lb.lb.id)).ok).toBe(true);
  });
});

/* ================================================================== */
/* 8. Internet gateway and egress                                     */
/* ================================================================== */

describe('scenario: internet egress', () => {
  it('requires a gateway before a VM may hold an external IP', () => {
    const base = threeTierBase();
    expect(expectFail(createVm(base.state, { name: 'web-1', subnetId: base.web, withExternalIp: true })).code).toBe('INVALID_STATE');

    const gated = expectOk(attachInternetGateway(base.state, { name: 'igw', vpcId: base.vpcId })).value.state;
    const vm = expectOk(createVm(gated, { name: 'web-1', subnetId: base.web, withExternalIp: true })).value;
    expect(vm.vm.externalIp).toBeTruthy();
  });

  it('serves an allowed port and drops everything else from the internet', () => {
    const base = threeTierBase();
    const gated = expectOk(attachInternetGateway(base.state, { name: 'igw', vpcId: base.vpcId })).value.state;
    const vm = expectOk(createVm(gated, { name: 'web-1', subnetId: base.web, withExternalIp: true })).value;

    const opened = openPort(vm.state, base.vpcId, base.web, 'web-policy', '80');

    expect(allowed(opened, fromInternet(vm.vm.internalIp, 80))).toBe(true);
    expect(allowed(opened, fromInternet(vm.vm.internalIp, 443))).toBe(false);
  });

  it('keeps a private tier unreachable from the internet', () => {
    const base = threeTierBase();
    const gated = expectOk(attachInternetGateway(base.state, { name: 'igw', vpcId: base.vpcId })).value.state;
    const withApp = expectOk(createVm(gated, { name: 'app-1', subnetId: base.app })).value;
    const db = expectOk(createVm(withApp.state, { name: 'db-1', subnetId: base.db })).value;

    const policy = expectOk(createNsg(db.state, { name: 'db-policy', vpcId: base.vpcId })).value;
    const scoped = expectOk(attachNsg(policy.state, policy.nsg.id, { subnetIds: [base.db] })).value.state;
    const opened = expectOk(
      addRule(scoped, policy.nsg.id, {
        name: 'allow-postgres',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'tcp',
        portRange: '5432',
        sourceCidr: '10.0.2.0/24',
        destCidr: '0.0.0.0/0',
        description: 'App tier only.',
      })
    ).value.state;

    expect(db.vm.externalIp).toBeUndefined();
    // The app tier may reach it; the internet may not.
    expect(allowed(opened, between(withApp.vm.internalIp, db.vm.internalIp, 5432))).toBe(true);
    expect(allowed(opened, fromInternet(db.vm.internalIp, 5432))).toBe(false);
  });
});

/* ================================================================== */
/* 9. The three-tier ERP reference architecture                       */
/* ================================================================== */

describe('scenario: one-click three-tier ERP reference architecture', () => {
  it('builds the full topology in one call', () => {
    const arch = buildThreeTierErp({ webSize: 2, appSize: 3 });
    const s = arch.state;

    expect(s.vpcs).toHaveLength(1);
    expect(s.subnets).toHaveLength(3);
    expect(s.gateways).toHaveLength(1);
    expect(s.nsgs).toHaveLength(3);
    expect(s.instanceTemplates).toHaveLength(3);
    expect(s.instanceGroups).toHaveLength(3);
    expect(s.loadBalancers).toHaveLength(2);

    expect(arch.webGroup.vmIds).toHaveLength(2);
    expect(arch.appGroup.vmIds).toHaveLength(3);
    expect(arch.dbGroup.vmIds).toHaveLength(1);
    expect(s.vms).toHaveLength(6);
  });

  it('keeps the tiers in their own subnets with autoscaling bounds', () => {
    const arch = buildThreeTierErp();
    const s = arch.state;

    const webSubnetId = s.subnets.find((x) => x.name === 'web-subnet')!.id;
    const appSubnetId = s.subnets.find((x) => x.name === 'app-subnet')!.id;
    const dbSubnetId = s.subnets.find((x) => x.name === 'db-subnet')!.id;

    expect(s.vms.filter((v) => v.subnetId === webSubnetId)).toHaveLength(2);
    expect(s.vms.filter((v) => v.subnetId === appSubnetId)).toHaveLength(3);
    expect(s.vms.filter((v) => v.subnetId === dbSubnetId)).toHaveLength(1);

    expect(arch.webGroup.minSize).toBe(2);
    expect(arch.webGroup.maxSize).toBe(6);
    expect(arch.appGroup.minSize).toBe(2);
    expect(arch.appGroup.maxSize).toBe(8);
  });

  it('gives the web tier public addresses and the other tiers none', () => {
    const arch = buildThreeTierErp();
    const web = arch.state.vms.filter((v) => v.networkTags.includes('web'));
    const privateTiers = arch.state.vms.filter((v) => v.networkTags.includes('app') || v.networkTags.includes('db'));

    expect(web.length).toBeGreaterThan(0);
    for (const vm of privateTiers) expect(vm.externalIp).toBeUndefined();
  });

  it('attaches a 500 GB SSD to the single database instance', () => {
    const arch = buildThreeTierErp();
    const data = arch.state.disks.find((d) => d.name === 'erp-data')!;

    expect(data.sizeGb).toBe(500);
    expect(data.type).toBe('pd-ssd');
    expect(data.attachedVmId).toBe(arch.dbGroup.vmIds[0]);
  });

  it('serves the intended traffic and blocks everything else', () => {
    const arch = buildThreeTierErp();
    const s = arch.state;
    const web = s.vms.find((v) => v.networkTags.includes('web'))!;
    const app = s.vms.find((v) => v.networkTags.includes('app'))!;
    const db = s.vms.find((v) => v.networkTags.includes('db'))!;

    const results = {
      internetToWeb: allowed(s, fromInternet(web.internalIp, 80)),
      internetToDb: allowed(s, fromInternet(db.internalIp, 5432)),
      webToApp: allowed(s, between(web.internalIp, app.internalIp, 8080)),
      appToDb: allowed(s, between(app.internalIp, db.internalIp, 5432)),
      webToDb: allowed(s, between(web.internalIp, db.internalIp, 5432)),
    };

    expect(results).toEqual({
      internetToWeb: true,
      internetToDb: false,
      webToApp: true,
      appToDb: true,
      webToDb: false,
    });
  });

  it('autoscales a tier and its load balancer together', () => {
    const arch = buildThreeTierErp({ webSize: 2, appSize: 2 });
    const scaled = expectOk(scaleGroupBehindLoadBalancers(arch.state, arch.webGroup.id, 6)).value;
    const lb = scaled.state.loadBalancers.find((l) => l.name === 'web-lb')!;

    expect(scaled.state.vms.filter((v) => v.networkTags.includes('web'))).toHaveLength(6);
    expect(lb.backendVmIds).toHaveLength(6);

    // Scaling the web tier leaves the app tier alone.
    expect(scaled.state.vms.filter((v) => v.networkTags.includes('app'))).toHaveLength(2);
  });

  it('survives a JSON round trip as a working network', () => {
    const arch = buildThreeTierErp();
    const revived = JSON.parse(JSON.stringify(arch.state)) as SimState;

    expect(revived.instanceGroups).toHaveLength(3);
    expect(revived.instanceTemplates).toHaveLength(3);
    expect(revived.vms).toHaveLength(6);

    const web = revived.vms.find((v) => v.networkTags.includes('web'))!;
    expect(allowed(revived, fromInternet(web.internalIp, 80))).toBe(true);
  });

  it('clamps a requested size that the autoscaling bounds cannot honour', () => {
    const arch = buildThreeTierErp({ webSize: 99, appSize: 0 });
    expect(arch.webGroup.vmIds).toHaveLength(6);
    expect(arch.appGroup.vmIds).toHaveLength(2);
  });

  it('records an audit trail for the whole build', () => {
    const arch = buildThreeTierErp();
    const actions = new Set(arch.state.events.map((e) => e.action));

    expect(actions.has('compute.networks.create')).toBe(true);
    expect(actions.has('compute.instanceTemplates.insert')).toBe(true);
    expect(actions.has('compute.instanceGroups.insert')).toBe(true);
    expect(arch.state.events.every((e) => e.actor === 'student@localcloud.dev')).toBe(true);
  });
});

/* ================================================================== */
/* 10. Failure handling                                               */
/* ================================================================== */

describe('scenario: every operation fails safely', () => {
  it('returns an actionable error, never a throw, for each bad call', () => {
    const base = threeTierBase();
    const vm = expectOk(createVm(base.state, { name: 'web-1', subnetId: base.web })).value;
    const tpl = expectOk(createInstanceTemplate(base.state, { name: 'web-tpl', subnetId: base.web })).value;
    const group = expectOk(createInstanceGroup(tpl.state, { name: 'web-mig', templateId: tpl.template.id, targetSize: 1, minSize: 1, maxSize: 2 })).value;
    const opened = openPort(group.state, base.vpcId, base.web, 'web-policy', '80');
    const lb = expectOk(createLoadBalancer(opened, { name: 'web-lb', type: 'external-http', vpcId: base.vpcId, port: 80, backendVmIds: group.group.vmIds })).value;

    const cases: [string, SimResult<unknown>][] = [
      ['bad vpc name', createVpc(base.state, { name: 'Bad Name' })],
      ['missing vpc', createSubnet(base.state, { name: 'x', vpcId: 'vpc-nope', cidr: '10.9.0.0/24' })],
      ['bad cidr', createSubnet(base.state, { name: 'x', vpcId: base.vpcId, cidr: 'not-a-cidr' })],
      ['missing subnet', createVm(base.state, { name: 'x', subnetId: 'subnet-nope' })],
      ['bad disk size', createDisk(base.state, { name: 'x', sizeGb: -1 })],
      ['missing disk on attach', attachDisk(vm.state, 'disk-nope', vm.vm.id)],
      ['missing vm on attach', attachDisk(vm.state, 'disk-nope', 'vm-nope')],
      ['missing vm on delete', deleteVm(base.state, 'vm-nope')],
      ['missing disk on delete', deleteDisk(base.state, 'disk-nope')],
      ['missing lb on delete', deleteLoadBalancer(lb.state, 'lb-nope')],
      ['bad lb port', createLoadBalancer(lb.state, { name: 'p2', type: 'internal-tcp', vpcId: base.vpcId, port: 99999 })],
      ['missing subnet on template', createInstanceTemplate(base.state, { name: 'x', subnetId: 'subnet-nope' })],
      ['missing template on group', createInstanceGroup(base.state, { name: 'x', templateId: 'tpl-nope' })],
      ['missing group on resize', resizeInstanceGroup(base.state, 'mig-nope', 3)],
      ['missing group on delete', deleteInstanceGroup(base.state, 'mig-nope')],
      ['missing template on delete', deleteInstanceTemplate(base.state, 'tpl-nope')],
      ['missing lb on rebind', setLoadBalancerBackends(lb.state, 'lb-nope', [vm.vm.id])],
      ['unknown backend on rebind', setLoadBalancerBackends(lb.state, lb.lb.id, ['vm-nope'])],
    ];

    for (const [label, result] of cases) {
      const failure = expectFail(result);
      // What the console renders in the toast.
      expect(failure.message.length, `${label} needs a message`).toBeGreaterThan(0);
      expect(failure.howToFix.length, `${label} needs a how-to-fix`).toBeGreaterThan(0);
    }
  });

  it('does not create resources when an operation fails', () => {
    const base = threeTierBase();

    expectFail(createSubnet(base.state, { name: 'x', vpcId: base.vpcId, cidr: '10.0.1.0/24' }));
    expectFail(createVm(base.state, { name: 'Bad', subnetId: base.web }));

    expect(base.state.subnets).toHaveLength(3);
    expect(base.state.vms).toHaveLength(0);
    // No IDs were burned and no resource was created by the failed calls.
    expect(base.state.sequence).toBe(4);
  });
});