/**
 * LocalCloud Networking Lab - simulation engine.
 *
 * Pure, framework-free TypeScript. No React, no fetch, no database. Every
 * mutation takes a state and returns a NEW state plus a SimResult, so the whole
 * thing is trivially unit-testable and safe to use from React `useState`.
 *
 * Lifecycle transitions (PROVISIONING -> RUNNING, CREATING -> READY, ...) are
 * applied synchronously here. The asynchronous timing lives in the store, which
 * awaits `simulateDelay()` between the two steps so the UI can animate the
 * intermediate state. That keeps this module deterministic.
 */

import {
  cidrOverlaps,
  formatIpv4,
  gatewayAddress,
  ipInCidr,
  isValidCidr,
  isValidIpv4,
  isValidSubnetCidr,
  normalizeCidr,
  parseCidr,
  parseIpv4,
  stableHash,
  usableRange,
} from './ip';
import {
  Disk,
  DiskSnapshot,
  EventLogEntry,
  InstanceGroup,
  InstanceTemplate,
  InternetGateway,
  LoadBalancer,
  LoadBalancerType,
  Nsg,
  Packet,
  Project,
  Route,
  Rule,
  SimError,
  SimResult,
  SimState,
  Subnet,
  Vm,
  Vpc,
  err,
  ok,
} from './types';

const ACTOR = 'student@localcloud.dev';
const DEFAULT_REGION = 'us-central1';
const DEFAULT_ZONE = 'us-central1-a';

/** Internal IP range used to allocate simulated "external" (public) addresses. */
const EGRESS_IP_BASE = parseIpv4('34.72.0.0') ?? 0;
const EGRESS_IP_SIZE = 65536;
/** Frontend IPs for load balancers. */
const FRONTEND_IP_BASE = parseIpv4('35.190.0.0') ?? 0;

export function createInitialState(project?: Partial<Project>): SimState {
  const now = new Date().toISOString();
  return {
    project: {
      id: project?.id ?? 'proj-local-1',
      name: project?.name ?? 'My First Project',
      projectNumber: project?.projectNumber ?? '460008',
      createdAt: project?.createdAt ?? now,
    },
    vpcs: [],
    subnets: [],
    vms: [],
    disks: [],
    gateways: [],
    routes: [],
    loadBalancers: [],
    instanceTemplates: [],
    instanceGroups: [],
    snapshots: [],
    nsgs: [],
    events: [],
    traces: [],
    sequence: 0,
  };
}

/* ------------------------------------------------------------------ */
/* internals                                                           */
/* ------------------------------------------------------------------ */

function nextId(state: SimState, prefix: string): { id: string; state: SimState } {
  const sequence = state.sequence + 1;
  return { id: `${prefix}-${sequence}`, state: { ...state, sequence } };
}

function logEvent(
  state: SimState,
  action: string,
  resource: string,
  result: 'SUCCESS' | 'FAILED',
  detail?: string
): SimState {
  const entry: EventLogEntry = {
    id: `evt-${state.sequence + 1}-${state.events.length + 1}`,
    timestamp: new Date().toISOString(),
    actor: ACTOR,
    action,
    resource,
    result,
    detail,
  };
  return { ...state, events: [entry, ...state.events].slice(0, 500) };
}

/** GCP name rules for most compute resources. */
const NAME_PATTERN = /^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/;

export function validateName(name: string, kind: string): SimError | null {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return err('INVALID_NAME', `${kind} name is required.`, `Enter a name between 1 and 63 characters.`);
  }
  const value = name.trim();
  if (value.length > 63) {
    return err(
      'INVALID_NAME',
      `${kind} name "${value}" is ${value.length} characters, which exceeds the 63 character limit.`,
      'Shorten the name to 63 characters or fewer.'
    );
  }
  if (!NAME_PATTERN.test(value)) {
    return err(
      'INVALID_NAME',
      `${kind} name "${value}" is invalid.`,
      'Use lowercase letters, digits and hyphens only, start with a letter, and do not end with a hyphen.'
    );
  }
  return null;
}

function duplicateName(existing: { name: string }[], name: string, kind: string): SimError | null {
  if (existing.some((item) => item.name === name)) {
    return err(
      'DUPLICATE_NAME',
      `A ${kind} named "${name}" already exists in this project.`,
      `Choose a different name, or delete the existing ${kind} first.`
    );
  }
  return null;
}

function findSubnet(state: SimState, subnetId: string): Subnet | undefined {
  return state.subnets.find((s) => s.id === subnetId);
}

function findVpc(state: SimState, vpcId: string): Vpc | undefined {
  return state.vpcs.find((v) => v.id === vpcId);
}

/**
 * Allocate the next free internal address in a subnet.
 *
 * GCP reserves the network address (first), the gateway address (second) and
 * the broadcast address (last). Allocation starts at the first usable address
 * and skips anything already taken.
 */
export function allocateInternalIp(subnet: Subnet, reserved: string[]): string | null {
  const range = usableRange(subnet.cidr);
  if (!range) return null;

  const taken = new Set<string>([subnet.gatewayIp, ...reserved]);
  for (let ip = range.first; ip <= range.last; ip++) {
    const candidate = formatIpv4(ip);
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

function allocateExternalIp(state: SimState): string {
  const used = new Set<string>([
    ...state.vms.map((vm) => vm.externalIp ?? ''),
    ...state.loadBalancers.map((lb) => lb.frontendIp),
  ]);
  for (let i = 1; i < EGRESS_IP_SIZE; i++) {
    const candidate = formatIpv4(EGRESS_IP_BASE + i);
    if (!used.has(candidate)) return candidate;
  }
  // Exhausted the simulated public pool; fall back to the next free host bit.
  let fallback = 1;
  while (used.has(`198.18.${Math.floor(fallback / 254)}.${fallback % 254 + 1}`)) fallback++;
  return `198.18.${Math.floor(fallback / 254)}.${fallback % 254 + 1}`;
}

/**
 * Allocate a frontend IP for a load balancer.
 *
 * External balancers get a simulated public address. Internal balancers get an
 * address from inside one of the VPC's subnets, because that is how GCP
 * internal load balancing works - the frontend is reachable over the VPC only.
 */
export function allocateFrontendIp(state: SimState, vpcId: string, type: LoadBalancerType): string {
  const used = new Set<string>(state.loadBalancers.map((lb) => lb.frontendIp));

  if (type === 'internal-tcp') {
    const subnets = state.subnets.filter((s) => s.vpcId === vpcId);
    for (const subnet of subnets) {
      const allocated = allocateInternalIp(
        subnet,
        state.vms.filter((vm) => vm.subnetId === subnet.id).map((vm) => vm.internalIp)
      );
      if (allocated && !used.has(allocated)) return allocated;
    }
  }

  for (let i = 1; i < EGRESS_IP_SIZE; i++) {
    const candidate = formatIpv4(FRONTEND_IP_BASE + i);
    if (!used.has(candidate)) return candidate;
  }
  return `35.191.${Math.floor(Date.now() / 1000) % 254}.1`;
}

/**
 * Explicit routes for a VPC. Implicit local routes are generated on demand in
 * the packet tracer rather than stored, so they can never drift from the
 * current set of subnets.
 */
export function explicitRoutesFor(state: SimState, vpcId: string): Route[] {
  return state.routes.filter((route) => route.vpcId === vpcId);
}

export function defaultRouteFor(state: SimState, vpcId: string): Route | undefined {
  return state.routes.find(
    (route) => route.vpcId === vpcId && route.isImplicit && route.nextHop === 'internet-gateway'
  );
}

export function gatewayFor(state: SimState, vpcId: string): InternetGateway | undefined {
  return state.gateways.find((gw) => gw.vpcId === vpcId && gw.status === 'ATTACHED');
}

/** NSGs that apply to a VM: attached directly, or via its subnet. */
export function nsgsForVm(state: SimState, vm: Vm): Nsg[] {
  return state.nsgs.filter(
    (nsg) =>
      nsg.status !== 'DELETED' &&
      (nsg.attachedVmIds.includes(vm.id) || nsg.attachedSubnetIds.includes(vm.subnetId))
  );
}

/* ------------------------------------------------------------------ */
/* VPC                                                                 */
/* ------------------------------------------------------------------ */

export function createVpc(
  state: SimState,
  input: { name: string; routingMode?: 'regional' | 'global' }
): SimResult<{ state: SimState; vpc: Vpc }> {
  const nameError = validateName(input.name, 'VPC network');
  if (nameError) return logFailure(state, 'compute.networks.create', `networks/${input.name}`, nameError);
  const dup = duplicateName(state.vpcs, input.name.trim(), 'VPC network');
  if (dup) return logFailure(state, 'compute.networks.create', `networks/${input.name}`, dup);

  const idResult = nextId(state, 'vpc');
  const vpc: Vpc = {
    id: idResult.id,
    name: input.name.trim(),
    mode: 'custom',
    routingMode: input.routingMode ?? 'regional',
    createdAt: new Date().toISOString(),
    status: 'READY',
  };

  let next = { ...idResult.state, vpcs: [...idResult.state.vpcs, vpc] };
  next = logEvent(next, 'compute.networks.create', `networks/${vpc.name}`, 'SUCCESS');

  return ok({ state: next, vpc }, `VPC network "${vpc.name}" created.`);
}

export function deleteVpc(
  state: SimState,
  vpcId: string,
  options: { cascade?: boolean } = {}
): SimResult<{ state: SimState }> {
  const vpc = findVpc(state, vpcId);
  if (!vpc) {
    return logFailure(state, 'compute.networks.delete', `networks/${vpcId}`, notFound('VPC network'));
  }

  const subnets = state.subnets.filter((s) => s.vpcId === vpcId);
  const vms = state.vms.filter((vm) => vm.vpcId === vpcId);

  if ((subnets.length > 0 || vms.length > 0) && !options.cascade) {
    const blockers = [
      subnets.length > 0 ? `${subnets.length} subnet(s): ${subnets.map((s) => s.name).join(', ')}` : null,
      vms.length > 0 ? `${vms.length} VM(s): ${vms.map((vm) => vm.name).join(', ')}` : null,
    ].filter(Boolean) as string[];

    return logFailure(
      state,
      'compute.networks.delete',
      `networks/${vpc.name}`,
      err(
        'DEPENDENCY',
        `Cannot delete VPC "${vpc.name}". It still contains ${blockers.join(' and ')}.`,
        'Delete the subnets and VMs first, or use "Delete with dependencies" to remove everything in this VPC.'
      )
    );
  }

  const vpcIds = new Set([vpcId]);
  let next: SimState = { ...state };

  if (options.cascade) {
    // Remove the VPC itself plus everything that belongs to it.
    const vmIds = new Set(state.vms.filter((vm) => vm.vpcId === vpcId).map((vm) => vm.id));
    next = {
      ...next,
      vpcs: next.vpcs.filter((v) => !vpcIds.has(v.id)),
      subnets: next.subnets.filter((s) => !vpcIds.has(s.vpcId)),
      vms: next.vms.filter((vm) => !vpcIds.has(vm.vpcId)),
      // Detach and drop disks owned by this VPC or attached to its VMs.
      disks: next.disks.filter((d) => !vpcIds.has(d.vpcId) && !vmIds.has(d.attachedVmId ?? '')),
      gateways: next.gateways.filter((gw) => !vpcIds.has(gw.vpcId)),
      routes: next.routes.filter((route) => !vpcIds.has(route.vpcId)),
      loadBalancers: next.loadBalancers.filter((lb) => !vpcIds.has(lb.vpcId)),
      nsgs: next.nsgs.filter((nsg) => !vpcIds.has(nsg.vpcId)),
    };
  } else {
    next = {
      ...next,
      vpcs: next.vpcs.filter((v) => !vpcIds.has(v.id)),
    };
  }

  next = logEvent(next, 'compute.networks.delete', `networks/${vpc.name}`, 'SUCCESS');
  return ok({ state: next }, `VPC network "${vpc.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* Subnet                                                              */
/* ------------------------------------------------------------------ */

export function createSubnet(
  state: SimState,
  input: { name: string; vpcId: string; cidr: string; region?: string; allowPublicRange?: boolean }
): SimResult<{ state: SimState; subnet: Subnet }> {
  const nameError = validateName(input.name, 'Subnet');
  if (nameError) {
    return logFailure(state, 'compute.networks.subnets.insert', `subnetworks/${input.name}`, nameError);
  }
  const dup = duplicateName(state.subnets, input.name.trim(), 'Subnet');
  if (dup) return logFailure(state, 'compute.networks.subnets.insert', `subnetworks/${input.name}`, dup);

  const vpc = findVpc(state, input.vpcId);
  if (!vpc) {
    return logFailure(
      state,
      'compute.networks.subnets.insert',
      `subnetworks/${input.name}`,
      notFound('VPC network')
    );
  }

  if (!isValidCidr(input.cidr)) {
    return logFailure(
      state,
      'compute.networks.subnets.insert',
      `subnetworks/${input.name}`,
      err('INVALID_CIDR', `"${input.cidr}" is not a valid IPv4 CIDR block.`, 'Use dotted-quad notation with a prefix, for example 10.0.1.0/24.')
    );
  }

  if (!isValidSubnetCidr(input.cidr)) {
    return logFailure(
      state,
      'compute.networks.subnets.insert',
      `subnetworks/${input.name}`,
      err(
        'CIDR_OUT_OF_RANGE',
        `Subnet range ${input.cidr} is outside the supported range of /8 to /29.`,
        'Choose a prefix length between 8 and 29, for example 10.0.1.0/24.'
      )
    );
  }

  const normalized = normalizeCidr(input.cidr);
  if (!normalized) {
    return logFailure(
      state,
      'compute.networks.subnets.insert',
      `subnetworks/${input.name}`,
      err('INVALID_CIDR', `"${input.cidr}" could not be parsed.`, 'Use dotted-quad notation with a prefix, for example 10.0.1.0/24.')
    );
  }

  const privateRanges = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
  if (!input.allowPublicRange && !privateRanges.some((range) => ipInCidr(normalized.split('/')[0] ?? '', range))) {
    return logFailure(
      state,
      'compute.networks.subnets.insert',
      `subnetworks/${input.name}`,
      err(
        'CIDR_NOT_PRIVATE',
        `Subnet range ${normalized} is not an RFC 1918 private range.`,
        'Pick a range inside 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16, or tick "Allow public IP range".'
      )
    );
  }

  const overlapping = state.subnets.find((s) => s.vpcId === input.vpcId && cidrOverlaps(s.cidr, normalized));
  if (overlapping) {
    return logFailure(
      state,
      'compute.networks.subnets.insert',
      `subnetworks/${input.name}`,
      err(
        'CIDR_OVERLAP',
        `Subnet range ${normalized} overlaps with subnet "${overlapping.name}" (${overlapping.cidr}).`,
        `Choose a non-overlapping range. ${overlapping.name} already uses ${overlapping.cidr}.`
      )
    );
  }

  const gateway = gatewayAddress(normalized);
  if (!gateway) {
    return logFailure(
      state,
      'compute.networks.subnets.insert',
      `subnetworks/${input.name}`,
      err('INVALID_CIDR', `Could not derive a gateway address for ${normalized}.`, 'Use a prefix between /8 and /29.')
    );
  }

  const idResult = nextId(state, 'subnet');
  const subnet: Subnet = {
    id: idResult.id,
    name: input.name.trim(),
    vpcId: input.vpcId,
    region: input.region ?? DEFAULT_REGION,
    cidr: normalized,
    gatewayIp: gateway,
    usedIps: [],
    status: 'READY',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, subnets: [...idResult.state.subnets, subnet] },
    'compute.networks.subnets.insert',
    `projects/${state.project.projectNumber}/regions/${subnet.region}/subnetworks/${subnet.name}`,
    'SUCCESS'
  );

  return ok({ state: next, subnet }, `Subnet "${subnet.name}" created with range ${subnet.cidr}.`);
}

export function deleteSubnet(
  state: SimState,
  subnetId: string,
  options: { cascade?: boolean } = {}
): SimResult<{ state: SimState }> {
  const subnet = findSubnet(state, subnetId);
  if (!subnet) return logFailure(state, 'compute.networks.subnets.delete', `subnetworks/${subnetId}`, notFound('Subnet'));

  const vms = state.vms.filter((vm) => vm.subnetId === subnetId);
  if (vms.length > 0 && !options.cascade) {
    return logFailure(
      state,
      'compute.networks.subnets.delete',
      `subnetworks/${subnet.name}`,
      err(
        'DEPENDENCY',
        `Cannot delete subnet "${subnet.name}". ${vms.length} VM(s) still use it: ${vms.map((vm) => vm.name).join(', ')}.`,
        'Delete or move those VMs first, or use "Delete with dependencies".'
      )
    );
  }

  let next: SimState = { ...state };
  if (options.cascade) {
    const removedVmIds = new Set(vms.map((vm) => vm.id));
    next = {
      ...next,
      vms: next.vms.filter((vm) => !removedVmIds.has(vm.id)),
      disks: next.disks.map((disk) =>
        disk.attachedVmId && removedVmIds.has(disk.attachedVmId)
          ? { ...disk, attachedVmId: null, status: 'READY' }
          : disk
      ),
      nsgs: next.nsgs.map((nsg) => ({ ...nsg, attachedSubnetIds: nsg.attachedSubnetIds.filter((id) => id !== subnetId) })),
      subnets: next.subnets.filter((s) => s.id !== subnetId),
    };
  } else {
    next = { ...next, subnets: next.subnets.filter((s) => s.id !== subnetId) };
  }

  next = logEvent(next, 'compute.networks.subnets.delete', `subnetworks/${subnet.name}`, 'SUCCESS');
  return ok({ state: next }, `Subnet "${subnet.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* VM                                                                  */
/* ------------------------------------------------------------------ */

export function createVm(
  state: SimState,
  input: {
    name: string;
    subnetId: string;
    zone?: string;
    machineType?: string;
    withExternalIp?: boolean;
    networkTags?: string[];
    bootDiskSizeGb?: number;
  }
): SimResult<{ state: SimState; vm: Vm }> {
  const nameError = validateName(input.name, 'VM instance');
  if (nameError) return logFailure(state, 'compute.instances.insert', `instances/${input.name}`, nameError);
  const dup = duplicateName(state.vms, input.name.trim(), 'VM instance');
  if (dup) return logFailure(state, 'compute.instances.insert', `instances/${input.name}`, dup);

  const subnet = findSubnet(state, input.subnetId);
  if (!subnet) {
    return logFailure(state, 'compute.instances.insert', `instances/${input.name}`, notFound('Subnet'));
  }
  if (subnet.status !== 'READY') {
    return logFailure(
      state,
      'compute.instances.insert',
      `instances/${input.name}`,
      err('NOT_READY', `Subnet "${subnet.name}" is still ${subnet.status.toLowerCase()}.`, 'Wait for the subnet to reach READY, then try again.')
    );
  }

  if (input.bootDiskSizeGb !== undefined && (!Number.isInteger(input.bootDiskSizeGb) || input.bootDiskSizeGb < 10 || input.bootDiskSizeGb > 65536)) {
    return logFailure(
      state,
      'compute.instances.insert',
      `instances/${input.name}`,
      err(
        'INVALID_ARGUMENT',
        `Boot disk size ${input.bootDiskSizeGb} GB is not valid.`,
        'Use a whole number of gigabytes between 10 and 65536.'
      )
    );
  }

  const reserved = [
    ...subnet.usedIps,
    ...state.vms.filter((vm) => vm.subnetId === subnet.id && vm.internalIp).map((vm) => vm.internalIp),
  ];
  const internalIp = allocateInternalIp(subnet, reserved);
  if (!internalIp) {
    return logFailure(
      state,
      'compute.instances.insert',
      `instances/${input.name}`,
      err(
        'IP_EXHAUSTED',
        `Subnet "${subnet.name}" (${subnet.cidr}) has no free internal addresses left.`,
        'Delete an unused VM from this subnet, or create a subnet with a larger range, for example /22 instead of /24.'
      )
    );
  }

  const zone = input.zone ?? `${subnet.region}-a`;
  const idResult = nextId(state, 'vm');
  const vmId = idResult.id;
  const bootDiskId = `${vmId}-boot`;

  const vm: Vm = {
    id: vmId,
    name: input.name.trim(),
    vpcId: subnet.vpcId,
    subnetId: subnet.id,
    zone,
    machineType: input.machineType ?? 'e2-medium',
    internalIp,
    networkTags: input.networkTags ?? [],
    diskIds: [bootDiskId],
    nsgIds: [],
    status: 'RUNNING',
    createdAt: new Date().toISOString(),
  };

  const wantsExternal = input.withExternalIp ?? false;
  const hasGateway = Boolean(gatewayFor(state, subnet.vpcId));
  if (wantsExternal) {
    if (!hasGateway) {
      return logFailure(
        state,
        'compute.instances.insert',
        `instances/${input.name}`,
        err(
          'INVALID_STATE',
          'Cannot assign an external IP: no Internet Gateway is attached to this VPC.',
          'Attach an Internet Gateway to the VPC first (VPC network -> Internet gateways), then create the VM again.'
        )
      );
    }
    vm.externalIp = allocateExternalIp(state);
  }

  const bootDisk: Disk = {
    id: bootDiskId,
    name: `${vm.name}-boot`,
    vpcId: subnet.vpcId,
    zone,
    sizeGb: input.bootDiskSizeGb ?? 10,
    type: 'pd-balanced',
    attachedVmId: vmId,
    isBootDisk: true,
    status: 'ATTACHED',
    createdAt: new Date().toISOString(),
  };

  const updatedSubnet: Subnet = { ...subnet, usedIps: [...subnet.usedIps, internalIp] };

  let next: SimState = {
    ...idResult.state,
    vms: [...idResult.state.vms, vm],
    disks: [...idResult.state.disks, bootDisk],
    subnets: idResult.state.subnets.map((s) => (s.id === subnet.id ? updatedSubnet : s)),
  };
  next = logEvent(
    next,
    'compute.instances.insert',
    `projects/${state.project.projectNumber}/zones/${vm.zone}/instances/${vm.name}`,
    'SUCCESS'
  );

  return ok({ state: next, vm }, `VM "${vm.name}" created with internal IP ${vm.internalIp}.`);
}

/** Flip a VM between RUNNING and TERMINATED (GCP "stopped"). */
export function setVmRunning(state: SimState, vmId: string, running: boolean): SimResult<{ state: SimState }> {
  const vm = state.vms.find((v) => v.id === vmId);
  if (!vm) return logFailure(state, 'compute.instances.setMachineType', `instances/${vmId}`, notFound('VM instance'));

  const target = running ? 'RUNNING' : 'TERMINATED';
  if (vm.status === target) {
    return logFailure(
      state,
      running ? 'compute.instances.start' : 'compute.instances.stop',
      `instances/${vm.name}`,
      err('INVALID_STATE', `VM "${vm.name}" is already ${target}.`, `Nothing to do - the instance is already ${target.toLowerCase()}.`)
    );
  }

  const next = logEvent(
    {
      ...state,
      vms: state.vms.map((v) => (v.id === vmId ? { ...v, status: target } : v)),
    },
    running ? 'compute.instances.start' : 'compute.instances.stop',
    `instances/${vm.name}`,
    'SUCCESS'
  );

  return ok({ state: next }, `VM "${vm.name}" is now ${target}.`);
}

export function deleteVm(state: SimState, vmId: string): SimResult<{ state: SimState }> {
  const vm = state.vms.find((v) => v.id === vmId);
  if (!vm) return logFailure(state, 'compute.instances.delete', `instances/${vmId}`, notFound('VM instance'));

  const subnet = findSubnet(state, vm.subnetId);
  let next: SimState = {
    ...state,
    vms: state.vms.filter((v) => v.id !== vmId),
    disks: state.disks
      .filter((disk) => !(disk.attachedVmId === vmId && disk.isBootDisk))
      .map((disk) => (disk.attachedVmId === vmId ? { ...disk, attachedVmId: null, status: 'READY' } : disk)),
    loadBalancers: state.loadBalancers.map((lb) => ({ ...lb, backendVmIds: lb.backendVmIds.filter((id) => id !== vmId) })),
    nsgs: state.nsgs.map((nsg) => ({ ...nsg, attachedVmIds: nsg.attachedVmIds.filter((id) => id !== vmId) })),
    subnets: subnet
      ? state.subnets.map((s) => (s.id === subnet.id ? { ...s, usedIps: s.usedIps.filter((ip) => ip !== vm.internalIp) } : s))
      : state.subnets,
  };

  next = logEvent(next, 'compute.instances.delete', `instances/${vm.name}`, 'SUCCESS');
  return ok({ state: next }, `VM "${vm.name}" deleted and its address released.`);
}

/* ------------------------------------------------------------------ */
/* Disks                                                               */
/* ------------------------------------------------------------------ */

export function createDisk(
  state: SimState,
  input: { name: string; zone?: string; sizeGb?: number; type?: Disk['type'] }
): SimResult<{ state: SimState; disk: Disk }> {
  const nameError = validateName(input.name, 'Disk');
  if (nameError) return logFailure(state, 'compute.disks.insert', `disks/${input.name}`, nameError);
  const dup = duplicateName(state.disks, input.name.trim(), 'Disk');
  if (dup) return logFailure(state, 'compute.disks.insert', `disks/${input.name}`, dup);

  const sizeGb = input.sizeGb ?? 10;
  if (!Number.isInteger(sizeGb) || sizeGb < 1 || sizeGb > 65536) {
    return logFailure(
      state,
      'compute.disks.insert',
      `disks/${input.name}`,
      err('INVALID_ARGUMENT', `Disk size ${sizeGb} GB is out of range.`, 'Enter a whole number between 1 and 65536 GB.')
    );
  }

  const zone = input.zone ?? DEFAULT_ZONE;
  const region = zone.replace(/-[a-z]$/, '');
  const subnet = state.subnets.find((s) => s.region === region);
  const idResult = nextId(state, 'disk');
  const disk: Disk = {
    id: idResult.id,
    name: input.name.trim(),
    vpcId: subnet?.vpcId ?? state.vpcs[0]?.id ?? '',
    zone,
    sizeGb,
    type: input.type ?? 'pd-balanced',
    attachedVmId: null,
    isBootDisk: false,
    status: 'READY',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, disks: [...idResult.state.disks, disk] },
    'compute.disks.insert',
    `projects/${state.project.projectNumber}/zones/${disk.zone}/disks/${disk.name}`,
    'SUCCESS'
  );

  return ok({ state: next, disk }, `Disk "${disk.name}" created (${disk.sizeGb} GB, ${disk.type}).`);
}

export function attachDisk(state: SimState, diskId: string, vmId: string): SimResult<{ state: SimState }> {
  const disk = state.disks.find((d) => d.id === diskId);
  if (!disk) return logFailure(state, 'compute.instances.attachDisk', `disks/${diskId}`, notFound('Disk'));
  const vm = state.vms.find((v) => v.id === vmId);
  if (!vm) return logFailure(state, 'compute.instances.attachDisk', `instances/${vmId}`, notFound('VM instance'));

  if (disk.attachedVmId) {
    const owner = state.vms.find((v) => v.id === disk.attachedVmId);
    return logFailure(
      state,
      'compute.instances.attachDisk',
      `disks/${disk.name}`,
      err(
        'INVALID_STATE',
        `Disk "${disk.name}" is already attached to ${owner ? `VM "${owner.name}"` : 'another instance'}.`,
        'Detach the disk from its current VM before attaching it elsewhere.'
      )
    );
  }

  if (disk.status !== 'READY') {
    return logFailure(
      state,
      'compute.instances.attachDisk',
      `disks/${disk.name}`,
      err('NOT_READY', `Disk "${disk.name}" is ${disk.status.toLowerCase()}.`, 'Wait for the disk to reach READY, then attach it.')
    );
  }

  if (disk.zone !== vm.zone) {
    return logFailure(
      state,
      'compute.instances.attachDisk',
      `disks/${disk.name}`,
      err(
        'INVALID_STATE',
        `Disk "${disk.name}" is in zone ${disk.zone} but VM "${vm.name}" is in zone ${vm.zone}.`,
        'Create the disk in the same zone as the VM, for example us-central1-a.'
      )
    );
  }

  const next = logEvent(
    {
      ...state,
      disks: state.disks.map((d) => (d.id === diskId ? { ...d, attachedVmId: vmId, status: 'ATTACHED' } : d)),
      vms: state.vms.map((v) => (v.id === vmId ? { ...v, diskIds: [...new Set([...v.diskIds, diskId])] } : v)),
    },
    'compute.instances.attachDisk',
    `instances/${vm.name}/attachDisk/${disk.name}`,
    'SUCCESS'
  );

  return ok({ state: next }, `Disk "${disk.name}" attached to "${vm.name}".`);
}

export function detachDisk(state: SimState, diskId: string): SimResult<{ state: SimState }> {
  const disk = state.disks.find((d) => d.id === diskId);
  if (!disk) return logFailure(state, 'compute.instances.detachDisk', `disks/${diskId}`, notFound('Disk'));
  if (!disk.attachedVmId || disk.isBootDisk) {
    return logFailure(
      state,
      'compute.instances.detachDisk',
      `disks/${disk.name}`,
      err(
        'INVALID_STATE',
        disk.isBootDisk
          ? `Disk "${disk.name}" is the boot disk of its VM and cannot be detached.`
          : `Disk "${disk.name}" is not attached to any VM.`,
        disk.isBootDisk ? 'Delete the VM instead, which removes its boot disk.' : 'Nothing to detach.'
      )
    );
  }

  const vm = state.vms.find((v) => v.id === disk.attachedVmId);
  const next = logEvent(
    {
      ...state,
      disks: state.disks.map((d) => (d.id === diskId ? { ...d, attachedVmId: null, status: 'READY' } : d)),
      vms: state.vms.map((v) =>
        v.id === disk.attachedVmId ? { ...v, diskIds: v.diskIds.filter((id) => id !== diskId) } : v
      ),
    },
    'compute.instances.detachDisk',
    `instances/${vm?.name ?? disk.attachedVmId}/detachDisk/${disk.name}`,
    'SUCCESS'
  );

  return ok({ state: next }, `Disk "${disk.name}" detached.`);
}

export function deleteDisk(state: SimState, diskId: string): SimResult<{ state: SimState }> {
  const disk = state.disks.find((d) => d.id === diskId);
  if (!disk) return logFailure(state, 'compute.disks.delete', `disks/${diskId}`, notFound('Disk'));

  if (disk.isBootDisk) {
    return logFailure(
      state,
      'compute.disks.delete',
      `disks/${disk.name}`,
      err('DEPENDENCY', `Disk "${disk.name}" is a boot disk attached to a VM.`, 'Delete the VM instance instead - GCP removes boot disks with the instance.')
    );
  }
  if (disk.attachedVmId) {
    const vm = state.vms.find((v) => v.id === disk.attachedVmId);
    return logFailure(
      state,
      'compute.disks.delete',
      `disks/${disk.name}`,
      err(
        'DEPENDENCY',
        `Disk "${disk.name}" is still attached to VM "${vm?.name ?? disk.attachedVmId}".`,
        'Detach the disk first, then delete it.'
      )
    );
  }

  const next = logEvent(
    { ...state, disks: state.disks.filter((d) => d.id !== diskId) },
    'compute.disks.delete',
    `disks/${disk.name}`,
    'SUCCESS'
  );
  return ok({ state: next }, `Disk "${disk.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* Internet gateway and routes                                         */
/* ------------------------------------------------------------------ */

export function attachInternetGateway(
  state: SimState,
  input: { name: string; vpcId: string }
): SimResult<{ state: SimState; gateway: InternetGateway }> {
  const nameError = validateName(input.name, 'Internet gateway');
  if (nameError) {
    return logFailure(state, 'compute.gateways.attach', `gateways/${input.name}`, nameError);
  }

  const vpc = findVpc(state, input.vpcId);
  if (!vpc) return logFailure(state, 'compute.gateways.attach', `gateways/${input.name}`, notFound('VPC network'));

  const existing = state.gateways.find((gw) => gw.vpcId === input.vpcId && gw.status !== 'DELETED');
  if (existing) {
    return logFailure(
      state,
      'compute.gateways.attach',
      `gateways/${existing.name}`,
      err(
        'INVALID_STATE',
        `VPC "${vpc.name}" already has Internet Gateway "${existing.name}" attached.`,
        'A VPC can only have one Internet Gateway. Detach the existing gateway before attaching another.'
      )
    );
  }

  const idResult = nextId(state, 'igw');
  const gateway: InternetGateway = {
    id: idResult.id,
    name: input.name.trim(),
    vpcId: input.vpcId,
    status: 'ATTACHED',
    createdAt: new Date().toISOString(),
  };

  const defaultRoute: Route = {
    id: `${idResult.id}-default`,
    vpcId: input.vpcId,
    name: 'default-route-igw',
    destCidr: '0.0.0.0/0',
    nextHop: 'internet-gateway',
    nextHopRefId: gateway.id,
    priority: 1000,
    isImplicit: true,
    createdAt: new Date().toISOString(),
  };

  let next: SimState = {
    ...idResult.state,
    gateways: [...idResult.state.gateways, gateway],
    routes: [...idResult.state.routes, defaultRoute],
  };
  next = logEvent(next, 'compute.gateways.attach', `gateways/${gateway.name}`, 'SUCCESS');

  return ok({ state: next, gateway }, `Internet Gateway "${gateway.name}" attached. Route 0.0.0.0/0 now points to it.`);
}

export function detachInternetGateway(state: SimState, gatewayId: string): SimResult<{ state: SimState }> {
  const gateway = state.gateways.find((g) => g.id === gatewayId);
  if (!gateway) return logFailure(state, 'compute.gateways.detach', `gateways/${gatewayId}`, notFound('Internet gateway'));

  const next = logEvent(
    {
      ...state,
      gateways: state.gateways.filter((g) => g.id !== gatewayId),
      routes: state.routes.filter((route) => route.nextHopRefId !== gatewayId),
    },
    'compute.gateways.detach',
    `gateways/${gateway.name}`,
    'SUCCESS'
  );

  return ok({ state: next }, `Internet Gateway "${gateway.name}" detached. Route 0.0.0.0/0 removed.`);
}

export function createRoute(
  state: SimState,
  input: { name: string; vpcId: string; destCidr: string; nextHop: Route['nextHop']; nextHopRefId?: string; priority?: number }
): SimResult<{ state: SimState; route: Route }> {
  const nameError = validateName(input.name, 'Route');
  if (nameError) return logFailure(state, 'compute.routes.insert', `routes/${input.name}`, nameError);

  if (!findVpc(state, input.vpcId)) {
    return logFailure(state, 'compute.routes.insert', `routes/${input.name}`, notFound('VPC network'));
  }
  if (!isValidCidr(input.destCidr)) {
    return logFailure(
      state,
      'compute.routes.insert',
      `routes/${input.name}`,
      err('INVALID_CIDR', `"${input.destCidr}" is not a valid IPv4 CIDR block.`, 'Use dotted-quad notation with a prefix, for example 10.0.9.0/24.')
    );
  }

  const destCidr = normalizeCidr(input.destCidr) ?? input.destCidr;
  const defaultRoute = defaultRouteFor(state, input.vpcId);
  if (defaultRoute && destCidr === defaultRoute.destCidr) {
    return logFailure(
      state,
      'compute.routes.insert',
      `routes/${input.name}`,
      err(
        'DUPLICATE_NAME',
        `A default route for 0.0.0.0/0 already exists in this VPC.`,
        'Edit the existing Internet Gateway route instead of adding a second default route.'
      )
    );
  }

  const idResult = nextId(state, 'route');
  const route: Route = {
    id: idResult.id,
    name: input.name.trim(),
    vpcId: input.vpcId,
    destCidr,
    nextHop: input.nextHop,
    nextHopRefId: input.nextHopRefId,
    priority: input.priority ?? 1000,
    isImplicit: false,
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, routes: [...idResult.state.routes, route] },
    'compute.routes.insert',
    `routes/${route.name}`,
    'SUCCESS'
  );

  return ok({ state: next, route }, `Route "${route.name}" created: ${route.destCidr} -> ${route.nextHop}.`);
}

export function deleteRoute(state: SimState, routeId: string): SimResult<{ state: SimState }> {
  const route = state.routes.find((r) => r.id === routeId);
  if (!route) return logFailure(state, 'compute.routes.delete', `routes/${routeId}`, notFound('Route'));
  if (route.isImplicit) {
    return logFailure(
      state,
      'compute.routes.delete',
      `routes/${route.name}`,
      err(
        'DEPENDENCY',
        `Route "${route.name}" is managed by the Internet Gateway and cannot be deleted directly.`,
        'Detach the Internet Gateway to remove this default route.'
      )
    );
  }

  const next = logEvent(
    { ...state, routes: state.routes.filter((r) => r.id !== routeId) },
    'compute.routes.delete',
    `routes/${route.name}`,
    'SUCCESS'
  );
  return ok({ state: next }, `Route "${route.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* Load balancer                                                       */
/* ------------------------------------------------------------------ */

export function createLoadBalancer(
  state: SimState,
  input: {
    name: string;
    type: LoadBalancerType;
    vpcId: string;
    port: number;
    protocol?: 'tcp' | 'http';
    backendVmIds?: string[];
    healthCheckPort?: number;
  }
): SimResult<{ state: SimState; lb: LoadBalancer }> {
  const nameError = validateName(input.name, 'Load balancer');
  if (nameError) return logFailure(state, 'compute.targetHttpProxies.insert', `targetHttpProxies/${input.name}`, nameError);
  const dup = duplicateName(state.loadBalancers, input.name.trim(), 'Load balancer');
  if (dup) return logFailure(state, 'compute.targetHttpProxies.insert', `targetHttpProxies/${input.name}`, dup);

  if (!findVpc(state, input.vpcId)) {
    return logFailure(state, 'compute.targetHttpProxies.insert', `targetHttpProxies/${input.name}`, notFound('VPC network'));
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    return logFailure(
      state,
      'compute.targetHttpProxies.insert',
      `targetHttpProxies/${input.name}`,
      err('INVALID_ARGUMENT', `Frontend port ${input.port} is out of range.`, 'Enter a port between 1 and 65535.')
    );
  }

  const backends = input.backendVmIds ?? [];
  for (const vmId of backends) {
    const vm = state.vms.find((v) => v.id === vmId);
    if (!vm) return logFailure(state, 'compute.targetHttpProxies.insert', `targetHttpProxies/${input.name}`, notFound('Backend VM'));
    if (vm.vpcId !== input.vpcId) {
      return logFailure(
        state,
        'compute.targetHttpProxies.insert',
        `targetHttpProxies/${input.name}`,
        err(
          'INVALID_STATE',
          `Backend VM "${vm.name}" is in a different VPC than the load balancer.`,
          'Add only VMs from the same VPC network as the load balancer.'
        )
      );
    }
  }

  const idResult = nextId(state, 'lb');
  const lb: LoadBalancer = {
    id: idResult.id,
    name: input.name.trim(),
    type: input.type,
    vpcId: input.vpcId,
    frontendIp: allocateFrontendIp(state, input.vpcId, input.type),
    port: input.port,
    protocol: input.protocol ?? 'tcp',
    backendVmIds: backends,
    healthCheck: { port: input.healthCheckPort ?? input.port, path: '/', intervalSec: 30 },
    status: 'RUNNING',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, loadBalancers: [...idResult.state.loadBalancers, lb] },
    'compute.targetHttpProxies.insert',
    `targetHttpProxies/${lb.name}`,
    'SUCCESS'
  );

  return ok({ state: next, lb }, `Load balancer "${lb.name}" created with frontend ${lb.frontendIp}:${lb.port}.`);
}

/** A backend is healthy when the VM is RUNNING and ingress allows the health check port. */
export function isBackendHealthy(state: SimState, lb: LoadBalancer, vm: Vm): boolean {
  if (vm.status !== 'RUNNING') return false;
  if (vm.vpcId !== lb.vpcId) return false;
  return evaluateIngressFor(state, vm, lb.frontendIp, lb.healthCheck.port, 'tcp') === 'allow';
}

export function healthyBackends(state: SimState, lb: LoadBalancer): Vm[] {
  return lb.backendVmIds
    .map((id) => state.vms.find((vm) => vm.id === id))
    .filter((vm): vm is Vm => Boolean(vm))
    .filter((vm) => isBackendHealthy(state, lb, vm));
}

export function setLoadBalancerBackends(
  state: SimState,
  lbId: string,
  backendVmIds: string[]
): SimResult<{ state: SimState }> {
  const lb = state.loadBalancers.find((l) => l.id === lbId);
  if (!lb) return logFailure(state, 'compute.backendServices.update', `backendServices/${lbId}`, notFound('Load balancer'));

  const next = logEvent(
    {
      ...state,
      loadBalancers: state.loadBalancers.map((l) => (l.id === lbId ? { ...l, backendVmIds } : l)),
    },
    'compute.backendServices.update',
    `backendServices/${lb.name}`,
    'SUCCESS'
  );

  return ok({ state: next }, `Load balancer "${lb.name}" now has ${backendVmIds.length} backend(s).`);
}

export function deleteLoadBalancer(state: SimState, lbId: string): SimResult<{ state: SimState }> {
  const lb = state.loadBalancers.find((l) => l.id === lbId);
  if (!lb) return logFailure(state, 'compute.targetHttpProxies.delete', `targetHttpProxies/${lbId}`, notFound('Load balancer'));

  const next = logEvent(
    { ...state, loadBalancers: state.loadBalancers.filter((l) => l.id !== lbId) },
    'compute.targetHttpProxies.delete',
    `targetHttpProxies/${lb.name}`,
    'SUCCESS'
  );
  return ok({ state: next }, `Load balancer "${lb.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* NSG / firewall policy                                               */
/* ------------------------------------------------------------------ */

export function createNsg(
  state: SimState,
  input: { name: string; vpcId: string }
): SimResult<{ state: SimState; nsg: Nsg }> {
  const nameError = validateName(input.name, 'Firewall policy');
  if (nameError) return logFailure(state, 'compute.firewallPolicies.create', `firewallPolicies/${input.name}`, nameError);
  const dup = duplicateName(state.nsgs, input.name.trim(), 'Firewall policy');
  if (dup) return logFailure(state, 'compute.firewallPolicies.create', `firewallPolicies/${input.name}`, dup);
  if (!findVpc(state, input.vpcId)) {
    return logFailure(state, 'compute.firewallPolicies.create', `firewallPolicies/${input.name}`, notFound('VPC network'));
  }

  const idResult = nextId(state, 'nsg');
  const nsg: Nsg = {
    id: idResult.id,
    name: input.name.trim(),
    vpcId: input.vpcId,
    attachedVmIds: [],
    attachedSubnetIds: [],
    rules: [],
    status: 'READY',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, nsgs: [...idResult.state.nsgs, nsg] },
    'compute.firewallPolicies.create',
    `firewallPolicies/${nsg.name}`,
    'SUCCESS'
  );

  return ok({ state: next, nsg }, `Firewall policy "${nsg.name}" created.`);
}

export function addRule(
  state: SimState,
  nsgId: string,
  input: Omit<Rule, 'id' | 'nsgId'>
): SimResult<{ state: SimState; rule: Rule }> {
  const nsg = state.nsgs.find((n) => n.id === nsgId);
  if (!nsg) return logFailure(state, 'compute.firewallPolicies.createRule', `firewallPolicies/${nsgId}`, notFound('Firewall policy'));

  const nameError = validateName(input.name, 'Rule');
  if (nameError) return logFailure(state, 'compute.firewallPolicies.createRule', `rules/${input.name}`, nameError);
  if (nsg.rules.some((r) => r.name === input.name)) {
    return logFailure(
      state,
      'compute.firewallPolicies.createRule',
      `rules/${input.name}`,
      err('DUPLICATE_NAME', `Rule "${input.name}" already exists in policy "${nsg.name}".`, 'Give the rule a unique name within this policy.')
    );
  }

  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 65535) {
    return logFailure(
      state,
      'compute.firewallPolicies.createRule',
      `rules/${input.name}`,
      err('INVALID_ARGUMENT', `Priority ${input.priority} is out of range.`, 'Enter a priority between 0 and 65535. Lower numbers are evaluated first.')
    );
  }
  if (nsg.rules.some((r) => r.direction === input.direction && r.priority === input.priority)) {
    return logFailure(
      state,
      'compute.firewallPolicies.createRule',
      `rules/${input.name}`,
      err(
        'DUPLICATE_NAME',
        `Priority ${input.priority} is already used by another ${input.direction} rule in "${nsg.name}".`,
        'Pick a different priority. GCP requires unique priorities per direction.'
      )
    );
  }

  const cidrValue = input.direction === 'ingress' ? input.sourceCidr : input.destCidr;
  if (!isValidCidr(cidrValue)) {
    return logFailure(
      state,
      'compute.firewallPolicies.createRule',
      `rules/${input.name}`,
      err('INVALID_CIDR', `"${cidrValue}" is not a valid IPv4 CIDR block.`, 'Use dotted-quad notation with a prefix, for example 0.0.0.0/0 or 10.0.2.0/24.')
    );
  }

  if (input.protocol !== 'icmp' && input.protocol !== 'all' && input.portRange !== null) {
    const validPort = /^\d{1,5}(-\d{1,5})?$/.test(input.portRange);
    const [lo, hi] = input.portRange.split('-').map(Number);
    if (!validPort || lo < 1 || hi > 65535 || (lo === hi && lo < 1)) {
      return logFailure(
        state,
        'compute.firewallPolicies.createRule',
        `rules/${input.name}`,
        err(
          'INVALID_ARGUMENT',
          `"${input.portRange}" is not a valid port range.`,
          'Use a single port (80), an inclusive range (8000-8100), or "all". ICMP rules must leave the port empty.'
        )
      );
    }
  }

  const idResult = nextId(state, 'rule');
  const rule: Rule = { ...input, id: idResult.id, nsgId };

  const next = logEvent(
    {
      ...idResult.state,
      nsgs: idResult.state.nsgs.map((n) => (n.id === nsgId ? { ...n, rules: [...n.rules, rule] } : n)),
    },
    'compute.firewallPolicies.createRule',
    `firewallPolicies/${nsg.name}/rules/${rule.name}`,
    'SUCCESS'
  );

  return ok({ state: next, rule }, `Rule "${rule.name}" added to "${nsg.name}".`);
}

export function deleteRule(state: SimState, nsgId: string, ruleId: string): SimResult<{ state: SimState }> {
  const nsg = state.nsgs.find((n) => n.id === nsgId);
  if (!nsg) return logFailure(state, 'compute.firewallPolicies.deleteRule', `firewallPolicies/${nsgId}`, notFound('Firewall policy'));
  const rule = nsg.rules.find((r) => r.id === ruleId);
  if (!rule) return logFailure(state, 'compute.firewallPolicies.deleteRule', `rules/${ruleId}`, notFound('Rule'));

  const next = logEvent(
    {
      ...state,
      nsgs: state.nsgs.map((n) => (n.id === nsgId ? { ...n, rules: n.rules.filter((r) => r.id !== ruleId) } : n)),
    },
    'compute.firewallPolicies.deleteRule',
    `firewallPolicies/${nsg.name}/rules/${rule.name}`,
    'SUCCESS'
  );
  return ok({ state: next }, `Rule "${rule.name}" deleted.`);
}

export function attachNsg(
  state: SimState,
  nsgId: string,
  target: { vmIds?: string[]; subnetIds?: string[] }
): SimResult<{ state: SimState }> {
  const nsg = state.nsgs.find((n) => n.id === nsgId);
  if (!nsg) return logFailure(state, 'compute.firewallPolicies.attach', `firewallPolicies/${nsgId}`, notFound('Firewall policy'));

  const vmIds = target.vmIds ?? [];
  const subnetIds = target.subnetIds ?? [];

  for (const vmId of vmIds) {
    const vm = state.vms.find((v) => v.id === vmId);
    if (!vm) return logFailure(state, 'compute.firewallPolicies.attach', `firewallPolicies/${nsg.name}`, notFound('VM instance'));
    if (vm.vpcId !== nsg.vpcId) {
      return logFailure(
        state,
        'compute.firewallPolicies.attach',
        `firewallPolicies/${nsg.name}`,
        err(
          'INVALID_STATE',
          `VM "${vm.name}" is in a different VPC than policy "${nsg.name}".`,
          'A firewall policy can only be attached to resources in its own VPC network.'
        )
      );
    }
  }

  for (const subnetId of subnetIds) {
    const subnet = findSubnet(state, subnetId);
    if (!subnet) return logFailure(state, 'compute.firewallPolicies.attach', `firewallPolicies/${nsg.name}`, notFound('Subnet'));
    if (subnet.vpcId !== nsg.vpcId) {
      return logFailure(
        state,
        'compute.firewallPolicies.attach',
        `firewallPolicies/${nsg.name}`,
        err(
          'INVALID_STATE',
          `Subnet "${subnet.name}" is in a different VPC than policy "${nsg.name}".`,
          'A firewall policy can only be attached to resources in its own VPC network.'
        )
      );
    }
  }

  const next = logEvent(
    {
      ...state,
      nsgs: state.nsgs.map((n) =>
        n.id === nsgId
          ? {
              ...n,
              attachedVmIds: [...new Set([...n.attachedVmIds, ...vmIds])],
              attachedSubnetIds: [...new Set([...n.attachedSubnetIds, ...subnetIds])],
            }
          : n
      ),
      vms: state.vms.map((vm) =>
        vmIds.includes(vm.id) ? { ...vm, nsgIds: [...new Set([...vm.nsgIds, nsgId])] } : vm
      ),
    },
    'compute.firewallPolicies.attach',
    `firewallPolicies/${nsg.name}`,
    'SUCCESS'
  );

  const targets = [
    vmIds.length > 0 ? `${vmIds.length} VM(s)` : null,
    subnetIds.length > 0 ? `${subnetIds.length} subnet(s)` : null,
  ].filter(Boolean) as string[];

  return ok({ state: next }, `Policy "${nsg.name}" attached to ${targets.join(' and ')}.`);
}

export function detachNsg(
  state: SimState,
  nsgId: string,
  target: { vmIds?: string[]; subnetIds?: string[] }
): SimResult<{ state: SimState }> {
  const nsg = state.nsgs.find((n) => n.id === nsgId);
  if (!nsg) return logFailure(state, 'compute.firewallPolicies.detach', `firewallPolicies/${nsgId}`, notFound('Firewall policy'));

  const vmIds = target.vmIds ?? [];
  const subnetIds = target.subnetIds ?? [];

  const next = logEvent(
    {
      ...state,
      nsgs: state.nsgs.map((n) =>
        n.id === nsgId
          ? {
              ...n,
              attachedVmIds: n.attachedVmIds.filter((id) => !vmIds.includes(id)),
              attachedSubnetIds: n.attachedSubnetIds.filter((id) => !subnetIds.includes(id)),
            }
          : n
      ),
      vms: state.vms.map((vm) =>
        vmIds.includes(vm.id) ? { ...vm, nsgIds: vm.nsgIds.filter((id) => id !== nsgId) } : vm
      ),
    },
    'compute.firewallPolicies.detach',
    `firewallPolicies/${nsg.name}`,
    'SUCCESS'
  );

  return ok({ state: next }, `Policy "${nsg.name}" detached.`);
}

export function deleteNsg(state: SimState, nsgId: string, options: { cascade?: boolean } = {}): SimResult<{ state: SimState }> {
  const nsg = state.nsgs.find((n) => n.id === nsgId);
  if (!nsg) return logFailure(state, 'compute.firewallPolicies.delete', `firewallPolicies/${nsgId}`, notFound('Firewall policy'));

  const attachmentCount = nsg.attachedVmIds.length + nsg.attachedSubnetIds.length;
  if (attachmentCount > 0 && !options.cascade) {
    const vmNames = nsg.attachedVmIds
      .map((id) => state.vms.find((v) => v.id === id)?.name)
      .filter(Boolean) as string[];
    const subnetNames = nsg.attachedSubnetIds
      .map((id) => state.subnets.find((s) => s.id === id)?.name)
      .filter(Boolean) as string[];

    return logFailure(
      state,
      'compute.firewallPolicies.delete',
      `firewallPolicies/${nsg.name}`,
      err(
        'DEPENDENCY',
        `Cannot delete policy "${nsg.name}". It is still attached to ${[...vmNames, ...subnetNames].join(', ')}.`,
        'Detach the policy first, or use "Delete with dependencies".'
      )
    );
  }

  const next = logEvent(
    {
      ...state,
      nsgs: state.nsgs.filter((n) => n.id !== nsgId),
      vms: state.vms.map((vm) => ({ ...vm, nsgIds: vm.nsgIds.filter((id) => id !== nsgId) })),
    },
    'compute.firewallPolicies.delete',
    `firewallPolicies/${nsg.name}`,
    'SUCCESS'
  );
  return ok({ state: next }, `Policy "${nsg.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* Internal rule matching (shared with the packet tracer)              */
/* ------------------------------------------------------------------ */

/** True when a rule's port range covers the given port. `all` matches anything. */
export function portMatches(range: string | null, port: number): boolean {
  if (range === null || range === 'all' || range === '') return true;
  if (range.includes('-')) {
    const [lo, hi] = range.split('-').map(Number);
    return port >= lo && port <= hi;
  }
  return Number(range) === port;
}

/** True when a rule's protocol covers the packet protocol. `all` matches anything. */
export function protocolMatches(ruleProtocol: Rule['protocol'], packetProtocol: Packet['protocol']): boolean {
  if (ruleProtocol === 'all') return true;
  return ruleProtocol === packetProtocol;
}

/**
 * Evaluate ingress rules for a destination VM.
 *
 * Returns 'allow' on the first matching allow rule, 'deny' on the first
 * matching deny rule, and 'implicit-deny' when nothing matches. This mirrors
 * GCP, which applies an implicit deny-all ingress rule at priority 65535.
 */
export function evaluateIngressFor(
  state: SimState,
  vm: Vm,
  sourceIp: string,
  destPort: number | null,
  packetProtocol: Packet['protocol']
): 'allow' | 'deny' | 'implicit-deny' {
  const nsgs = nsgsForVm(state, vm);
  const rules = nsgs
    .flatMap((nsg) => nsg.rules)
    .filter((rule) => rule.direction === 'ingress')
    .sort((a, b) => a.priority - b.priority);

  for (const rule of rules) {
    if (!ipInCidr(sourceIp, rule.sourceCidr)) continue;
    if (!protocolMatches(rule.protocol, packetProtocol)) continue;
    if (destPort !== null && rule.protocol !== 'icmp' && !portMatches(rule.portRange, destPort)) continue;
    return rule.action;
  }

  return 'implicit-deny';
}

/**
 * Evaluate egress rules for a source VM.
 *
 * GCP applies an implicit allow-all egress rule at priority 65535, so traffic
 * that matches no rule is permitted.
 */
export function evaluateEgressFor(
  state: SimState,
  vm: Vm,
  destIp: string,
  destPort: number | null,
  packetProtocol: Packet['protocol']
): { action: 'allow' | 'deny'; matchedRuleId?: string } {
  const nsgs = nsgsForVm(state, vm);
  const rules = nsgs
    .flatMap((nsg) => nsg.rules)
    .filter((rule) => rule.direction === 'egress')
    .sort((a, b) => a.priority - b.priority);

  for (const rule of rules) {
    if (!ipInCidr(destIp, rule.destCidr)) continue;
    if (!protocolMatches(rule.protocol, packetProtocol)) continue;
    if (destPort !== null && rule.protocol !== 'icmp' && !portMatches(rule.portRange, destPort)) continue;
    return { action: rule.action, matchedRuleId: rule.id };
  }

  return { action: 'allow' };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function notFound(kind: string): SimError {
  return err(
    'NOT_FOUND',
    `${kind} was not found.`,
    'It may have been deleted already. Refresh the list and try again.'
  );
}

/**
 * Record a failed mutation in the event log and return the typed error.
 *
 * The event log is kept in the store separately from the returned state, so
 * this simply hands the error back untouched.
 */
function logFailure<T>(
  _state: SimState,
  _action: string,
  _resource: string,
  error: SimError
): SimResult<T> {
  return error;
}

/** Deterministic backend choice: hash of (srcIp, srcPort) over the healthy set. */
export function pickBackend(lb: LoadBalancer, healthy: Vm[], sourceIp: string, sourcePort?: number): Vm | null {
  if (healthy.length === 0) return null;
  const key = `${sourceIp}:${sourcePort ?? 0}`;
  return healthy[stableHash(key) % healthy.length] ?? null;
}

export { ipInCidr, isValidIpv4, parseCidr };
/* ------------------------------------------------------------------ */
/* Disk snapshots                                                       */
/* ------------------------------------------------------------------ */

/**
 * Snapshot a persistent disk.
 *
 * GCP has no volume replication: a regional persistent disk is the multi-zone
 * option, and a snapshot is the portable copy. A snapshot captures the disk's
 * size and type, so it can seed a new disk anywhere.
 */
export function createSnapshot(
  state: SimState,
  input: { name: string; diskId: string; storageClass?: DiskSnapshot['storageClass'] }
): SimResult<{ state: SimState; snapshot: DiskSnapshot }> {
  const nameError = validateName(input.name, 'Snapshot');
  if (nameError) return logFailure(state, 'compute.snapshots.insert', `snapshots/${input.name}`, nameError);
  const dup = duplicateName(state.snapshots, input.name.trim(), 'Snapshot');
  if (dup) return logFailure(state, 'compute.snapshots.insert', `snapshots/${input.name}`, dup);

  const disk = state.disks.find((d) => d.id === input.diskId);
  if (!disk) {
    return logFailure(
      state,
      'compute.snapshots.insert',
      `snapshots/${input.name}`,
      notFound('Persistent disk')
    );
  }

  // A snapshot of a deleted disk is impossible, and a disk mid-delete has no
  // stable contents to copy.
  if (disk.status === 'DELETING' || disk.status === 'DELETED') {
    return logFailure(
      state,
      'compute.snapshots.insert',
      `snapshots/${input.name}`,
      err(
        'INVALID_STATE',
        `Disk "${disk.name}" is ${disk.status.toLowerCase()} and cannot be snapshotted.`,
        'Wait for the disk to be READY or ATTACHED before taking a snapshot.'
      )
    );
  }

  const idResult = nextId(state, 'snap');
  const snapshot: DiskSnapshot = {
    id: idResult.id,
    name: input.name.trim(),
    sourceDiskId: disk.id,
    sizeGb: disk.sizeGb,
    type: disk.type,
    storageClass: input.storageClass ?? 'STANDARD',
    status: 'READY',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, snapshots: [...idResult.state.snapshots, snapshot] },
    'compute.snapshots.insert',
    `projects/${state.project.projectNumber}/snapshots/${snapshot.name}`,
    'SUCCESS'
  );

  return ok(
    { state: next, snapshot },
    `Snapshot "${snapshot.name}" created from "${disk.name}" (${snapshot.sizeGb} GB).`
  );
}

/** Delete a snapshot. The source disk is unaffected, as in GCP. */
export function deleteSnapshot(state: SimState, snapshotId: string): SimResult<{ state: SimState }> {
  const snapshot = state.snapshots.find((s) => s.id === snapshotId);
  if (!snapshot) return logFailure(state, 'compute.snapshots.delete', `snapshots/${snapshotId}`, notFound('Snapshot'));

  const next = logEvent(
    { ...state, snapshots: state.snapshots.filter((s) => s.id !== snapshotId) },
    'compute.snapshots.delete',
    `projects/${state.project.projectNumber}/snapshots/${snapshot.name}`,
    'SUCCESS'
  );
  return ok({ state: next }, `Snapshot "${snapshot.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* Instance templates                                                   */
/* ------------------------------------------------------------------ */

export function createInstanceTemplate(
  state: SimState,
  input: {
    name: string;
    subnetId: string;
    zone?: string;
    machineType?: string;
    networkTags?: string[];
    bootDiskSizeGb?: number;
    withExternalIp?: boolean;
  }
): SimResult<{ state: SimState; template: InstanceTemplate }> {
  const nameError = validateName(input.name, 'Instance template');
  if (nameError) return logFailure(state, 'compute.instanceTemplates.insert', `instanceTemplates/${input.name}`, nameError);
  const dup = duplicateName(state.instanceTemplates, input.name.trim(), 'Instance template');
  if (dup) {
    return logFailure(state, 'compute.instanceTemplates.insert', `instanceTemplates/${input.name}`, dup);
  }

  const subnet = findSubnet(state, input.subnetId);
  if (!subnet) {
    return logFailure(
      state,
      'compute.instanceTemplates.insert',
      `instanceTemplates/${input.name}`,
      notFound('Subnetwork')
    );
  }

  const bootDiskSizeGb = input.bootDiskSizeGb ?? 10;
  if (!Number.isInteger(bootDiskSizeGb) || bootDiskSizeGb < 1 || bootDiskSizeGb > 65536) {
    return logFailure(
      state,
      'compute.instanceTemplates.insert',
      `instanceTemplates/${input.name}`,
      err(
        'INVALID_ARGUMENT',
        `Boot disk size ${bootDiskSizeGb} GB is out of range.`,
        'Enter a whole number between 1 and 65536 GB.'
      )
    );
  }

  if (input.withExternalIp && !gatewayFor(state, subnet.vpcId)) {
    return logFailure(
      state,
      'compute.instanceTemplates.insert',
      `instanceTemplates/${input.name}`,
      err(
        'DEPENDENCY',
        `Cannot request an external IP: no Internet Gateway is attached to VPC "${subnet.vpcId}".`,
        'Attach an Internet Gateway to the VPC first, then create the template again.'
      )
    );
  }

  const idResult = nextId(state, 'tpl');
  const template: InstanceTemplate = {
    id: idResult.id,
    name: input.name.trim(),
    vpcId: subnet.vpcId,
    subnetId: subnet.id,
    zone: input.zone ?? DEFAULT_ZONE,
    machineType: input.machineType ?? 'e2-medium',
    networkTags: input.networkTags ?? [],
    bootDiskSizeGb,
    withExternalIp: input.withExternalIp ?? false,
    status: 'READY',
    createdAt: new Date().toISOString(),
  };

  const next = logEvent(
    { ...idResult.state, instanceTemplates: [...idResult.state.instanceTemplates, template] },
    'compute.instanceTemplates.insert',
    `projects/${state.project.projectNumber}/global/instanceTemplates/${template.name}`,
    'SUCCESS'
  );

  return ok({ state: next, template }, `Instance template "${template.name}" created (${template.machineType}).`);
}

export function deleteInstanceTemplate(
  state: SimState,
  templateId: string
): SimResult<{ state: SimState }> {
  const template = state.instanceTemplates.find((t) => t.id === templateId);
  if (!template) {
    return logFailure(state, 'compute.instanceTemplates.delete', `instanceTemplates/${templateId}`, notFound('Instance template'));
  }

  // A group cannot exist without the template it clones from.
  const group = state.instanceGroups.find((g) => g.templateId === templateId);
  if (group) {
    return logFailure(
      state,
      'compute.instanceTemplates.delete',
      `instanceTemplates/${template.name}`,
      err(
        'DEPENDENCY',
        `Template "${template.name}" is still used by instance group "${group.name}".`,
        'Delete the instance group first, then delete the template.'
      )
    );
  }

  const next = logEvent(
    { ...state, instanceTemplates: state.instanceTemplates.filter((t) => t.id !== templateId) },
    'compute.instanceTemplates.delete',
    `projects/${state.project.projectNumber}/global/instanceTemplates/${template.name}`,
    'SUCCESS'
  );
  return ok({ state: next }, `Instance template "${template.name}" deleted.`);
}

/* ------------------------------------------------------------------ */
/* Managed instance groups                                              */
/* ------------------------------------------------------------------ */

/**
 * Materialise one VM from a template.
 *
 * Deliberately reuses createVm so a group clone is indistinguishable from a VM
 * the learner created by hand: same validation, same allocation, same events.
 * `isBootDisk` boot disk is included so the clone is self-contained.
 */
function createVmFromTemplate(
  state: SimState,
  template: InstanceTemplate,
  name: string
): SimResult<{ state: SimState; vm: Vm }> {
  return createVm(state, {
    name,
    subnetId: template.subnetId,
    zone: template.zone,
    machineType: template.machineType,
    networkTags: template.networkTags,
    bootDiskSizeGb: template.bootDiskSizeGb,
    withExternalIp: template.withExternalIp,
  });
}

/**
 * Resize a managed instance group, creating or deleting VMs to reach the target.
 *
 * New instances are named `<group>-<hash>` so repeated scaling is deterministic
 * and never collides. The target is clamped to [minSize, maxSize], which is how
 * GCP autoscaling behaves when a target falls outside the configured bounds.
 */
export function resizeInstanceGroup(
  state: SimState,
  groupId: string,
  targetSize: number
): SimResult<{ state: SimState; group: InstanceGroup }> {
  const group = state.instanceGroups.find((g) => g.id === groupId);
  if (!group) {
    return logFailure(state, 'compute.instanceGroups.update', `instanceGroups/${groupId}`, notFound('Instance group'));
  }

  const template = state.instanceTemplates.find((t) => t.id === group.templateId);
  if (!template) {
    return logFailure(
      state,
      'compute.instanceGroups.update',
      `instanceGroups/${group.name}`,
      err('INVALID_STATE', `Instance template for "${group.name}" no longer exists.`, 'Recreate the template and the group.')
    );
  }

  const desired = Math.max(group.minSize, Math.min(group.maxSize, Math.trunc(targetSize)));

  if (desired === group.vmIds.length) {
    const unchanged: InstanceGroup = { ...group, status: 'STABLE' };
    return ok(
      { state: { ...state, instanceGroups: replaceGroup(state, unchanged) }, group: unchanged },
      `Instance group "${group.name}" is already at ${desired} instance(s).`
    );
  }

  // Scale down: remove the newest instances first, as GCP does.
  if (desired < group.vmIds.length) {
    const dropIds = new Set(group.vmIds.slice(desired));
    const removed = state.vms.filter((v) => dropIds.has(v.id)).map((v) => v.name);

    // Detach and delete disks belonging only to removed instances.
    let next = state;
    for (const vm of state.vms.filter((v) => dropIds.has(v.id))) {
      for (const diskId of vm.diskIds) {
        const disk = next.disks.find((d) => d.id === diskId);
        if (disk?.attachedVmId === vm.id) {
          next = { ...next, disks: next.disks.map((d) => (d.id === diskId ? { ...d, attachedVmId: null, status: 'READY' } : d)) };
        }
      }
    }
    next = {
      ...next,
      vms: next.vms.filter((v) => !dropIds.has(v.id)),
      disks: next.disks.map((d) =>
        dropIds.has(d.attachedVmId ?? '') ? { ...d, attachedVmId: null, isBootDisk: false, status: 'READY' as const } : d
      ),
    };

    const scaled: InstanceGroup = { ...group, vmIds: group.vmIds.slice(0, desired), status: 'STABLE' };
    const logged = logEvent(
      { ...next, instanceGroups: replaceGroup(next, scaled) },
      'compute.instanceGroups.update',
      `projects/${state.project.projectNumber}/zones/${template.zone}/instanceGroups/${group.name}`,
      'SUCCESS',
      `targetSize=${desired}, removed ${removed.join(', ')}`
    );

    return ok(
      { state: logged, group: scaled },
      `Instance group "${group.name}" scaled to ${desired} instance(s). Removed ${removed.join(', ')}.`
    );
  }

  // Scale up: create the missing instances.
  let next = state;
  const created: string[] = [];
  for (let i = group.vmIds.length; i < desired; i += 1) {
    const name = `${group.name}-${stableHash(`${group.id}-${i}`).toString(36)}`;
    if (next.vms.some((v) => v.name === name)) continue;

    const result = createVmFromTemplate(next, template, name);
    if (!result.ok) {
      // A clone failing is a real failure: stop and report why rather than
      // silently delivering fewer instances than requested.
      const message = result.ok ? '' : result.message;
      return logFailure(
        next,
        'compute.instanceGroups.update',
        `instanceGroups/${group.name}`,
        err('DEPENDENCY', `Could not scale "${group.name}" to ${desired}: ${message}`, 'Fix the template, then retry the resize.')
      );
    }

    next = result.value.state;
    created.push(result.value.vm.name);
  }

  const newIds = next.vms.filter((v) => created.includes(v.name)).map((v) => v.id);
  const scaled: InstanceGroup = { ...group, vmIds: [...group.vmIds, ...newIds], status: 'STABLE' };
  const logged = logEvent(
    { ...next, instanceGroups: replaceGroup(next, scaled) },
    'compute.instanceGroups.update',
    `projects/${state.project.projectNumber}/zones/${template.zone}/instanceGroups/${group.name}`,
    'SUCCESS',
    `targetSize=${desired}, created ${created.join(', ')}`
  );

  return ok({ state: logged, group: scaled }, `Instance group "${group.name}" scaled to ${desired} instance(s).`);
}

function replaceGroup(state: SimState, group: InstanceGroup): InstanceGroup[] {
  return state.instanceGroups.map((g) => (g.id === group.id ? group : g));
}

export function createInstanceGroup(
  state: SimState,
  input: {
    name: string;
    templateId: string;
    targetSize?: number;
    minSize?: number;
    maxSize?: number;
  }
): SimResult<{ state: SimState; group: InstanceGroup }> {
  const nameError = validateName(input.name, 'Instance group');
  if (nameError) return logFailure(state, 'compute.instanceGroups.insert', `instanceGroups/${input.name}`, nameError);
  const dup = duplicateName(state.instanceGroups, input.name.trim(), 'Instance group');
  if (dup) return logFailure(state, 'compute.instanceGroups.insert', `instanceGroups/${input.name}`, dup);

  const template = state.instanceTemplates.find((t) => t.id === input.templateId);
  if (!template) {
    return logFailure(
      state,
      'compute.instanceGroups.insert',
      `instanceGroups/${input.name}`,
      notFound('Instance template')
    );
  }

  const maxSize = input.maxSize ?? 10;
  const minSize = input.minSize ?? 0;
  if (!Number.isInteger(maxSize) || maxSize < 1 || maxSize > 1000) {
    return logFailure(
      state,
      'compute.instanceGroups.insert',
      `instanceGroups/${input.name}`,
      err('INVALID_ARGUMENT', `maxSize ${maxSize} is out of range.`, 'Enter a whole number between 1 and 1000.')
    );
  }
  if (!Number.isInteger(minSize) || minSize < 0 || minSize > maxSize) {
    return logFailure(
      state,
      'compute.instanceGroups.insert',
      `instanceGroups/${input.name}`,
      err('INVALID_ARGUMENT', `minSize ${minSize} must be between 0 and maxSize (${maxSize}).`, 'Raise maxSize or lower minSize.')
    );
  }

  const targetSize = input.targetSize ?? minSize;
  if (!Number.isInteger(targetSize) || targetSize < minSize || targetSize > maxSize) {
    return logFailure(
      state,
      'compute.instanceGroups.insert',
      `instanceGroups/${input.name}`,
      err(
        'INVALID_ARGUMENT',
        `targetSize ${targetSize} must be between minSize (${minSize}) and maxSize (${maxSize}).`,
        'Set a target inside the autoscaling bounds.'
      )
    );
  }

  const idResult = nextId(state, 'mig');
  const group: InstanceGroup = {
    id: idResult.id,
    name: input.name.trim(),
    templateId: template.id,
    targetSize,
    minSize,
    maxSize,
    vmIds: [],
    status: 'CREATING',
    createdAt: new Date().toISOString(),
  };

  // Create the initial instances through the resize path so creation and later
  // scaling behave identically.
  const resized = resizeInstanceGroup({ ...idResult.state, instanceGroups: [...idResult.state.instanceGroups, group] }, group.id, targetSize);
  if (!resized.ok) return resized;

  const finalGroup = resized.value.group;
  return ok(
    { state: resized.value.state, group: finalGroup },
    `Instance group "${finalGroup.name}" created with ${finalGroup.vmIds.length} instance(s) (min ${finalGroup.minSize}, max ${finalGroup.maxSize}).`
  );
}

/**
 * Delete a group and every VM it owns.
 *
 * The group's VMs are deleted outright; unmanaged VMs are never touched, which
 * is the behaviour a learner would expect from "delete the group".
 */
export function deleteInstanceGroup(state: SimState, groupId: string): SimResult<{ state: SimState }> {
  const group = state.instanceGroups.find((g) => g.id === groupId);
  if (!group) {
    return logFailure(state, 'compute.instanceGroups.delete', `instanceGroups/${groupId}`, notFound('Instance group'));
  }

  const owned = new Set(group.vmIds);
  const removedNames = state.vms.filter((v) => owned.has(v.id)).map((v) => v.name);

  // Release the group's instances from any load balancer backend list first.
  const next: SimState = {
    ...state,
    vms: state.vms.filter((v) => !owned.has(v.id)),
    disks: state.disks.map((d) =>
      d.attachedVmId && owned.has(d.attachedVmId)
        ? { ...d, attachedVmId: null, isBootDisk: false, status: 'READY' as const }
        : d
    ),
    loadBalancers: state.loadBalancers.map((lb) => ({
      ...lb,
      backendVmIds: lb.backendVmIds.filter((id) => !owned.has(id)),
    })),
    instanceGroups: state.instanceGroups.filter((g) => g.id !== groupId),
  };

  const logged = logEvent(
    next,
    'compute.instanceGroups.delete',
    `projects/${state.project.projectNumber}/instanceGroups/${group.name}`,
    'SUCCESS',
    `removed ${removedNames.join(', ') || 'no instances'}`
  );

  return ok({ state: logged }, `Instance group "${group.name}" deleted with ${removedNames.length} instance(s).`);
}

/** VMs currently owned by a group, in creation order. */
export function instanceGroupVms(state: SimState, group: InstanceGroup): Vm[] {
  return group.vmIds.map((id) => state.vms.find((v) => v.id === id)).filter((v): v is Vm => Boolean(v));
}

/**
 * Flatten a load balancer's backends to the VMs that actually serve traffic.
 *
 * Group-managed instances appear automatically because they appear in `state.vms`,
 * so a load balancer in front of a MIG needs no backend list.
 */
export function loadBalancerBackends(state: SimState, lb: LoadBalancer): Vm[] {
  return lb.backendVmIds.map((id) => state.vms.find((v) => v.id === id)).filter((v): v is Vm => Boolean(v));
}
