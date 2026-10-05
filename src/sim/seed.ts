/**
 * The "Load sample network" demo scenario.
 *
 * Builds the entire lab described in the spec in one synchronous pass so the
 * four expected traces can be verified in tests and reproduced in the UI.
 *
 *   VPC            demo-vpc
 *   Subnets        web-subnet 10.0.1.0/24, app-subnet 10.0.2.0/24, db-subnet 10.0.3.0/24
 *   VMs            web-1 (external IP), app-1, db-1
 *   Disk           data-disk-1 (50 GB) attached to db-1
 *   Gateway        demo-vpc-igw attached to demo-vpc
 *   LB             web-lb tcp/80 with backend web-1
 *   Policies       web-nsg on web-subnet, db-nsg on db-subnet
 */

import {
  addRule,
  attachDisk,
  attachInternetGateway,
  attachNsg,
  createDisk,
  createLoadBalancer,
  createInitialState,
  createNsg,
  createSubnet,
  createVm,
  createVpc,
  isBackendHealthy,
} from './engine';
import { evaluatePacket } from './packetTracer';
import { SimResult, SimState } from './types';

const EXTERNAL_CLIENT = '198.51.100.7';

/**
 * Unwrap a SimResult into a plain state. Demo seeding is trusted code with
 * pre-validated inputs, so a failure here is a programming error rather than
 * user input - it throws so the bug is visible instead of silently skipped.
 */
function unwrap(result: SimResult<{ state: SimState }>, label: string): SimState {
  if (!result.ok) {
    throw new Error(`Sample network step "${label}" failed: ${result.message}`);
  }
  return result.value.state;
}

/**
 * Build the complete demo network. Returns the final state ready for the UI.
 */
export function buildSampleNetwork(): SimState {
  let state = createInitialState({
    id: 'proj-demo',
    name: 'Networking Demo',
    projectNumber: '460008',
  });

  const vpcResult = createVpc(state, { name: 'demo-vpc' });
  if (!vpcResult.ok) throw new Error(`Sample network step "create vpc" failed: ${vpcResult.message}`);
  state = vpcResult.value.state;
  const vpcId = vpcResult.value.vpc.id;

  const subnets = [
    { name: 'web-subnet', cidr: '10.0.1.0/24', region: 'us-central1' },
    { name: 'app-subnet', cidr: '10.0.2.0/24', region: 'us-central1' },
    { name: 'db-subnet', cidr: '10.0.3.0/24', region: 'us-central1' },
  ];

  const subnetIds: Record<string, string> = {};
  for (const spec of subnets) {
    const result = createSubnet(state, { name: spec.name, vpcId, cidr: spec.cidr, region: spec.region });
    if (!result.ok) throw new Error(`Sample network step "create ${spec.name}" failed: ${result.message}`);
    state = result.value.state;
    subnetIds[spec.name] = result.value.subnet.id;
  }

  // The internet gateway must exist before any VM can hold an external IP.
  const gatewayResult = attachInternetGateway(state, { name: 'demo-vpc-igw', vpcId });
  if (!gatewayResult.ok) throw new Error(`Sample network step "create gateway" failed: ${gatewayResult.message}`);
  state = gatewayResult.value.state;

  const vmSpecs = [
    { name: 'web-1', subnet: 'web-subnet', withExternalIp: true },
    { name: 'app-1', subnet: 'app-subnet', withExternalIp: false },
    { name: 'db-1', subnet: 'db-subnet', withExternalIp: false },
  ];

  const vmIds: Record<string, string> = {};
  for (const spec of vmSpecs) {
    const result = createVm(state, {
      name: spec.name,
      subnetId: subnetIds[spec.subnet] as string,
      zone: 'us-central1-a',
      withExternalIp: spec.withExternalIp,
    });
    if (!result.ok) throw new Error(`Sample network step "create ${spec.name}" failed: ${result.message}`);
    state = result.value.state;
    vmIds[spec.name] = result.value.vm.id;
  }

  const diskResult = createDisk(state, { name: 'data-disk-1', zone: 'us-central1-a', sizeGb: 50, type: 'pd-ssd' });
  if (!diskResult.ok) throw new Error(`Sample network step "create data-disk-1" failed: ${diskResult.message}`);
  state = diskResult.value.state;
  state = unwrap(attachDisk(state, diskResult.value.disk.id, vmIds['db-1'] as string), 'attach data-disk-1');

  const lbResult = createLoadBalancer(state, {
    name: 'web-lb',
    type: 'external-http',
    vpcId,
    port: 80,
    protocol: 'tcp',
    backendVmIds: [vmIds['web-1'] as string],
  });
  if (!lbResult.ok) throw new Error(`Sample network step "create web-lb" failed: ${lbResult.message}`);
  state = lbResult.value.state;

  const webNsgResult = createNsg(state, { name: 'web-nsg', vpcId });
  if (!webNsgResult.ok) throw new Error(`Sample network step "create web-nsg" failed: ${webNsgResult.message}`);
  state = webNsgResult.value.state;
  state = unwrap(attachNsg(state, webNsgResult.value.nsg.id, { subnetIds: [subnetIds['web-subnet'] as string] }), 'attach web-nsg');

  const dbNsgResult = createNsg(state, { name: 'db-nsg', vpcId });
  if (!dbNsgResult.ok) throw new Error(`Sample network step "create db-nsg" failed: ${dbNsgResult.message}`);
  state = dbNsgResult.value.state;
  state = unwrap(attachNsg(state, dbNsgResult.value.nsg.id, { subnetIds: [subnetIds['db-subnet'] as string] }), 'attach db-nsg');

  const ruleSpecs: { nsgId: string; rule: Parameters<typeof addRule>[2] }[] = [
    {
      nsgId: webNsgResult.value.nsg.id,
      rule: {
        name: 'allow-http-from-anywhere',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'tcp',
        portRange: '80',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: 'Allow HTTP traffic from the internet to the web tier.',
      },
    },
    {
      nsgId: webNsgResult.value.nsg.id,
      rule: {
        name: 'allow-ssh-from-office',
        direction: 'ingress',
        action: 'allow',
        priority: 1100,
        protocol: 'tcp',
        portRange: '22',
        sourceCidr: '203.0.113.0/24',
        destCidr: '0.0.0.0/0',
        description: 'Allow SSH only from the office network.',
      },
    },
    {
      nsgId: webNsgResult.value.nsg.id,
      rule: {
        name: 'deny-all-ingress',
        direction: 'ingress',
        action: 'deny',
        priority: 65000,
        protocol: 'all',
        portRange: 'all',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: 'Deny everything not explicitly allowed above.',
      },
    },
    {
      nsgId: dbNsgResult.value.nsg.id,
      rule: {
        name: 'allow-postgres-from-app',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'tcp',
        portRange: '5432',
        sourceCidr: '10.0.2.0/24',
        destCidr: '0.0.0.0/0',
        description: 'Allow PostgreSQL traffic from the app tier only.',
      },
    },
  ];

  for (const spec of ruleSpecs) {
    const result = addRule(state, spec.nsgId, spec.rule);
    if (!result.ok) throw new Error(`Sample network step "add rule ${spec.rule.name}" failed: ${result.message}`);
    state = result.value.state;
  }

  return state;
}

export interface ExpectedTrace {
  label: string;
  packet: Parameters<typeof evaluatePacket>[1];
  expected: 'ALLOWED' | 'BLOCKED';
  /** Substring expected in the trace summary. */
  summaryIncludes: string;
}

export const EXPECTED_TRACES: ExpectedTrace[] = [
  {
    label: 'Internet -> web-lb on tcp/80',
    packet: { sourceIp: EXTERNAL_CLIENT, destIp: '@web-lb', protocol: 'tcp', destPort: 80, sourcePort: 51000 },
    expected: 'ALLOWED',
    summaryIncludes: 'ALLOWED',
  },
  {
    label: 'Internet -> web-1 on tcp/22',
    packet: { sourceIp: EXTERNAL_CLIENT, destIp: '@web-1', protocol: 'tcp', destPort: 22, sourcePort: 51001 },
    expected: 'BLOCKED',
    summaryIncludes: 'BLOCKED at ingress',
  },
  {
    label: 'app-1 -> db-1 on tcp/5432',
    packet: { sourceIp: '@app-1', destIp: '@db-1', protocol: 'tcp', destPort: 5432, sourcePort: 51002 },
    expected: 'ALLOWED',
    summaryIncludes: 'ALLOWED',
  },
  {
    label: 'web-1 -> db-1 on tcp/5432',
    packet: { sourceIp: '@web-1', destIp: '@db-1', protocol: 'tcp', destPort: 5432, sourcePort: 51003 },
    expected: 'BLOCKED',
    summaryIncludes: 'BLOCKED at ingress',
  },
];

/**
 * Resolve `@name` placeholders in a packet against the current state, so the
 * same expectation table works regardless of the generated IPs.
 */
export function resolveTracePacket(state: SimState, packet: ExpectedTrace['packet']) {
  const resolve = (ip: string): string => {
    if (!ip.startsWith('@')) return ip;
    const name = ip.slice(1);
    const vm = state.vms.find((v) => v.name === name);
    if (vm) return vm.internalIp;
    const lb = state.loadBalancers.find((l) => l.name === name);
    if (lb) return lb.frontendIp;
    return ip;
  };

  return {
    ...packet,
    sourceIp: resolve(packet.sourceIp),
    destIp: resolve(packet.destIp),
  };
}

export interface TraceCheckResult {
  label: string;
  actual: 'ALLOWED' | 'BLOCKED';
  expected: 'ALLOWED' | 'BLOCKED';
  pass: boolean;
  summary: string;
}

/** Run all four demo traces and report whether each matched expectations. */
export function verifyDemoTraces(state: SimState): TraceCheckResult[] {
  return EXPECTED_TRACES.map((expectation) => {
    const packet = resolveTracePacket(state, expectation.packet);
    const result = evaluatePacket(state, packet);
    return {
      label: expectation.label,
      actual: result.verdict,
      expected: expectation.expected,
      pass:
        result.verdict === expectation.expected && result.summary.includes(expectation.summaryIncludes),
      summary: result.summary,
    };
  });
}

/** Backends that would pass a health check right now, for UI display. */
export function demoBackendHealth(state: SimState) {
  return state.loadBalancers.map((lb) => ({
    name: lb.name,
    backends: lb.backendVmIds.map((id) => {
      const vm = state.vms.find((v) => v.id === id);
      return { vm: vm?.name ?? id, healthy: vm ? isBackendHealthy(state, lb, vm) : false };
    }),
  }));
}

export { EXTERNAL_CLIENT };