/**
 * Reference architectures: complete, opinionated networks built in one call.
 *
 * The lab's hand-built sample network is deliberately small so a learner can
 * reason about every hop. These are the opposite: full topologies that exercise
 * tiered networking, autoscaling, internal load balancing, and disk reuse.
 *
 * Every builder returns a plain `SimState`, so the same function backs the
 * scenario tests and the "Load architecture" action in the console.
 */

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
  createSubnet,
  createVpc,
  deleteInstanceGroup,
  resizeInstanceGroup,
  setLoadBalancerBackends,
} from './engine';
import { InstanceGroup, Rule, SimResult, SimState } from './types';

/** Runs one builder step, failing loudly so a broken plan is never half-applied. */
function step(state: SimState, label: string, result: SimResult<{ state: SimState }>): SimState {
  if (!result.ok) {
    throw new Error(`Reference architecture step "${label}" failed: ${result.message}`);
  }
  return result.value.state;
}

/**
 * Every rule in this architecture is ingress, where `destCidr` is unused but
 * still required by the `Rule` shape, so it is defaulted once here.
 */
function rule(partial: Omit<Rule, 'id' | 'nsgId' | 'destCidr'> & { destCidr?: string }): Omit<Rule, 'id' | 'nsgId'> {
  return { destCidr: '0.0.0.0/0', ...partial };
}

export interface ThreeTierArchitecture {
  state: SimState;
  webGroup: InstanceGroup;
  appGroup: InstanceGroup;
  dbGroup: InstanceGroup;
  /** Frontend address of the external load balancer in front of the web tier. */
  externalFrontendIp: string;
  /** Frontend address of the internal load balancer in front of the database. */
  internalFrontendIp: string;
}

/**
 * A three-tier ERP network: web, application and database tiers in separate
 * subnets, each tier behind a load balancer, with only the intended paths open.
 *
 * ```
 *   internet -> external-http/web-lb -> web-mig  (2..6 x e2-small)
 *                  app-mig                 (2..8 x e2-medium)
 *                  internal-tcp/db-lb -> db-ha   (1 x n2-standard-2 + 500 GB pd-ssd)
 * ```
 * Firewall intent: the web tier answers 80 from anywhere and 22 only from an
 * office range; the app tier is reachable only from the web subnet; the database
 * accepts 5432 only from the app subnet. Everything else is denied.
 */
export function buildThreeTierErp(options?: {
  region?: string;
  /** Initial size of the web tier. */
  webSize?: number;
  /** Initial size of the app tier. */
  appSize?: number;
}): ThreeTierArchitecture {
  const region = options?.region ?? 'us-central1';

  // The autoscaling bounds below are the contract. Clamping the requested size
  // keeps a one-click build from failing on a size it cannot honour, and matches
  // how an autoscaler treats an out-of-bounds target.
  const clamp = (want: number, min: number, max: number) => Math.max(min, Math.min(max, Math.trunc(want)));
  const webSize = clamp(options?.webSize ?? 2, 2, 6);
  const appSize = clamp(options?.appSize ?? 3, 2, 8);

  let s = createInitialState();

  s = step(s, 'create VPC', createVpc(s, { name: 'erp-vpc' }));
  const vpcId = s.vpcs[0].id;

  s = step(s, 'create web subnet', createSubnet(s, { name: 'web-subnet', vpcId, cidr: '10.10.1.0/24', region, allowPublicRange: true }));
  s = step(s, 'create app subnet', createSubnet(s, { name: 'app-subnet', vpcId, cidr: '10.10.2.0/24', region }));
  s = step(s, 'create db subnet', createSubnet(s, { name: 'db-subnet', vpcId, cidr: '10.10.3.0/24', region }));

  const webSubnet = s.subnets.find((x) => x.name === 'web-subnet')!;
  const appSubnet = s.subnets.find((x) => x.name === 'app-subnet')!;
  const dbSubnet = s.subnets.find((x) => x.name === 'db-subnet')!;

  // Public egress exists for the VPC, but only the web tier asks for an address.
  s = step(s, 'attach internet gateway', attachInternetGateway(s, { name: 'erp-igw', vpcId }));

  /* ---------------- firewall policies per tier ---------------- */

  const policySpecs: { name: string; subnetId: string; rules: Omit<Rule, 'id' | 'nsgId'>[] }[] = [
    {
      name: 'web-policy',
      subnetId: webSubnet.id,
      rules: [
        rule({ name: 'allow-http', direction: 'ingress', action: 'allow', priority: 1000, protocol: 'tcp', portRange: '80', sourceCidr: '0.0.0.0/0', description: 'Public web traffic.' }),
        rule({ name: 'allow-ssh-office', direction: 'ingress', action: 'allow', priority: 1100, protocol: 'tcp', portRange: '22', sourceCidr: '203.0.113.0/24', description: 'Administration from the office range only.' }),
        rule({ name: 'deny-rest', direction: 'ingress', action: 'deny', priority: 65000, protocol: 'all', portRange: 'all', sourceCidr: '0.0.0.0/0', description: 'Implicit deny for the web tier.' }),
      ],
    },
    {
      name: 'app-policy',
      subnetId: appSubnet.id,
      rules: [
        rule({ name: 'allow-from-web', direction: 'ingress', action: 'allow', priority: 1000, protocol: 'tcp', portRange: '8080', sourceCidr: webSubnet.cidr, description: 'Application traffic from the web tier.' }),
        rule({ name: 'allow-health-check', direction: 'ingress', action: 'allow', priority: 1010, protocol: 'tcp', portRange: '80', sourceCidr: '130.211.0.0/22', description: 'Google Cloud load balancer health checks.' }),
        rule({ name: 'deny-rest', direction: 'ingress', action: 'deny', priority: 65000, protocol: 'all', portRange: 'all', sourceCidr: '0.0.0.0/0', description: 'The app tier is private.' }),
      ],
    },
    {
      name: 'db-policy',
      subnetId: dbSubnet.id,
      rules: [
        rule({ name: 'allow-postgres', direction: 'ingress', action: 'allow', priority: 1000, protocol: 'tcp', portRange: '5432', sourceCidr: appSubnet.cidr, description: 'PostgreSQL from the app tier only.' }),
        rule({ name: 'deny-rest', direction: 'ingress', action: 'deny', priority: 65000, protocol: 'all', portRange: 'all', sourceCidr: '0.0.0.0/0', description: 'The database is never exposed.' }),
      ],
    },
  ];

  const policyIds: Record<string, string> = {};

  for (const spec of policySpecs) {
    const created = createNsg(s, { name: spec.name, vpcId });
    s = step(s, `create policy ${spec.name}`, created);
    const nsgId = created.ok ? created.value.nsg.id : '';
    policyIds[spec.name] = nsgId;
    s = step(s, `attach policy ${spec.name}`, attachNsg(s, nsgId, { subnetIds: [spec.subnetId] }));
    for (const r of spec.rules) {
      s = step(s, `add rule ${r.name}`, addRule(s, nsgId, r));
    }
  }

  /* ---------------- templates and managed groups ---------------- */

  const templateSpecs = [
    { name: 'web-tpl', subnetId: webSubnet.id, zone: `${region}-a`, machineType: 'e2-small', networkTags: ['web', 'erp'], bootDiskSizeGb: 10 },
    { name: 'app-tpl', subnetId: appSubnet.id, zone: `${region}-a`, machineType: 'e2-medium', networkTags: ['app', 'erp'], bootDiskSizeGb: 20 },
    { name: 'db-tpl', subnetId: dbSubnet.id, zone: `${region}-b`, machineType: 'n2-standard-2', networkTags: ['db', 'erp'], bootDiskSizeGb: 20 },
  ];

  for (const spec of templateSpecs) {
    s = step(s, `create template ${spec.name}`, createInstanceTemplate(s, { ...spec, withExternalIp: false }));
  }

  const webTplId = s.instanceTemplates.find((t) => t.name === 'web-tpl')!.id;
  const appTplId = s.instanceTemplates.find((t) => t.name === 'app-tpl')!.id;
  const dbTplId = s.instanceTemplates.find((t) => t.name === 'db-tpl')!.id;

  const groupSpecs = [
    { name: 'web-mig', templateId: webTplId, targetSize: webSize, minSize: 2, maxSize: 6 },
    { name: 'app-mig', templateId: appTplId, targetSize: appSize, minSize: 2, maxSize: 8 },
    { name: 'db-ha', templateId: dbTplId, targetSize: 1, minSize: 1, maxSize: 1 },
  ];

  for (const spec of groupSpecs) {
    s = step(s, `create group ${spec.name}`, createInstanceGroup(s, spec));
  }

  const webGroup = s.instanceGroups.find((g) => g.name === 'web-mig')!;
  const appGroup = s.instanceGroups.find((g) => g.name === 'app-mig')!;
  const dbGroup = s.instanceGroups.find((g) => g.name === 'db-ha')!;

  /* ---------------- data disk ---------------- */

  s = step(s, 'create data disk', createDisk(s, { name: 'erp-data', zone: `${region}-b`, sizeGb: 500, type: 'pd-ssd' }));
  const dataDiskId = s.disks.find((d) => d.name === 'erp-data')!.id;
  s = step(s, 'attach data disk', attachDisk(s, dataDiskId, dbGroup.vmIds[0]));

  /* ---------------- load balancing ---------------- */

  const externalLb = createLoadBalancer(s, {
    name: 'web-lb',
    type: 'external-http',
    vpcId,
    port: 80,
    protocol: 'tcp',
    backendVmIds: webGroup.vmIds,
    healthCheckPort: 80,
  });
  s = step(s, 'create external load balancer', externalLb);

  // Health checks arrive from the load balancer's own frontend address, so each
  // tier has to admit it explicitly. Without this the tiers correctly report
  // zero healthy backends and the architecture looks broken.
  const allowHealthCheck = (from: SimState, nsgId: string, fromIp: string, port: string, label: string) =>
    addRule(from, nsgId, rule({
      name: `allow-hc-${label}`,
      direction: 'ingress',
      action: 'allow',
      priority: 1020,
      protocol: 'tcp',
      portRange: port,
      sourceCidr: `${fromIp}/32`,
      description: `Health check from ${fromIp}.`,
    }));

  if (externalLb.ok) {
    s = step(
      s,
      'allow web health check',
      allowHealthCheck(s, policyIds['web-policy'], externalLb.value.lb.frontendIp, '80', 'web')
    );
  }

  const internalLb = createLoadBalancer(s, {
    name: 'db-lb',
    type: 'internal-tcp',
    vpcId,
    port: 5432,
    protocol: 'tcp',
    backendVmIds: dbGroup.vmIds,
    healthCheckPort: 5432,
  });
  s = step(s, 'create internal load balancer', internalLb);

  if (internalLb.ok) {
    s = step(
      s,
      'allow db health check',
      allowHealthCheck(s, policyIds['db-policy'], internalLb.value.lb.frontendIp, '5432', 'db')
    );
  }

  return {
    state: s,
    webGroup,
    appGroup,
    dbGroup,
    externalFrontendIp: externalLb.ok ? externalLb.value.lb.frontendIp : '',
    internalFrontendIp: internalLb.ok ? internalLb.value.lb.frontendIp : '',
  };
}

/**
 * Scale a managed group and re-point every load balancer that fronts it.
 *
 * Autoscaling changes which VMs serve traffic, so a load balancer must follow or
 * the tier silently loses capacity. Keeping that coupling in one place means the
 * console button and the scenario tests cannot drift apart.
 */
export function scaleGroupBehindLoadBalancers(
  state: SimState,
  groupId: string,
  targetSize: number
): SimResult<{ state: SimState; group: InstanceGroup }> {
  const before = state.instanceGroups.find((g) => g.id === groupId);
  if (!before) return resizeInstanceGroup(state, groupId, targetSize);

  const resized = resizeInstanceGroup(state, groupId, targetSize);
  if (!resized.ok) return resized;

  const updated = resized.value.group;
  let next = resized.value.state;

  for (const lb of state.loadBalancers) {
    // Only load balancers that were already tracking this group need updating.
    if (!lb.backendVmIds.some((id) => before.vmIds.includes(id))) continue;
    const rebind = setLoadBalancerBackends(next, lb.id, updated.vmIds);
    if (rebind.ok) next = rebind.value.state;
  }

  return {
    ok: true,
    value: { state: next, group: updated },
    message: `Instance group "${updated.name}" scaled to ${updated.vmIds.length} instance(s).`,
  };
}

/** Delete every instance group, leaving the VPC and any hand-built resources. */
export function removeAllInstanceGroups(state: SimState): SimState {
  let next = state;
  for (const group of [...state.instanceGroups]) {
    const removed = deleteInstanceGroup(next, group.id);
    if (removed.ok) next = removed.value.state;
  }
  return next;
}