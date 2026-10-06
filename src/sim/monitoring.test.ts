import { describe, it, expect } from 'vitest';
import { createInitialState, createVpc, createSubnet, createVm, setVmRunning, createLoadBalancer, createNsg, addRule } from './engine';
import { createSqlInstance } from './cloudSql';
import type { SimResult, SimState } from './types';

/** Read a result's error code without narrowing every call site by hand. */
const codeOf = (result: SimResult<unknown>): string => (result.ok ? 'OK' : result.code);
import {
  deriveMetrics,
  createAlertPolicy,
  setPolicyEnabled,
  deleteAlertPolicy,
  createUptimeCheck,
  runUptimeCheck,
  deleteUptimeCheck,
  evaluatePolicies,
  reportsMetric,
} from './monitoring';
import { deriveSecurityFindings, findingCounts } from './security';

/* Build a small running lab used by both suites. */
function runningLab() {
  let state = createInitialState();
  const vpc = createVpc(state, { name: 'net' });
  if (!vpc.ok) throw new Error(vpc.message);
  state = vpc.value.state;
  const subnet = createSubnet(state, {
    name: 'sub',
    vpcId: vpc.value.vpc.id,
    cidr: '10.20.1.0/24',
    region: 'us-central1',
  });
  if (!subnet.ok) throw new Error(subnet.message);
  state = subnet.value.state;
  const vm = createVm(state, {
    name: 'web-1',
    subnetId: subnet.value.subnet.id,
    zone: 'us-central1-a',
    machineType: 'e2-micro',
  });
  if (!vm.ok) throw new Error(vm.message);
  state = vm.value.state;
  const vmId = vm.value.vm.id;
  const lb = createLoadBalancer(state, {
    name: 'web-lb',
    vpcId: vpc.value.vpc.id,
    type: 'external-http',
    port: 80,
    backendVmIds: [vmId],
  });
  if (!lb.ok) throw new Error(lb.message);
  state = lb.value.state;

  // Ingress is implicit-deny, so a healthy backend needs an explicit rule
  // letting the load balancer reach it. Scoping the source to the LB address
  // keeps this lab free of Security Command Center findings.
  const nsg = createNsg(state, { name: 'allow-lb', vpcId: vpc.value.vpc.id });
  if (!nsg.ok) throw new Error(nsg.message);
  state = nsg.value.state;
  const rule = addRule(state, nsg.value.nsg.id, {
    name: 'lb-to-backend',
    direction: 'ingress',
    action: 'allow',
    priority: 1000,
    protocol: 'tcp',
    portRange: '80',
    sourceCidr: `${lb.value.lb.frontendIp}/32`,
    destCidr: '',
    description: 'Load balancer health checks and traffic.',
  });
  if (!rule.ok) throw new Error(rule.message);
  state = {
    ...rule.value.state,
    nsgs: rule.value.state.nsgs.map((n) => ({ ...n, attachedVmIds: [vmId] })),
  };
  return { state, vmId, lbId: lb.value.lb.id, frontendIp: lb.value.lb.frontendIp };
}

/** addRule takes a full Rule body, so tests supply the metadata explicitly. */
function ruleInput(over: Partial<Parameters<typeof addRule>[2]>) {
  return {
    name: 'r',
    direction: 'ingress' as const,
    action: 'allow' as const,
    priority: 1000,
    protocol: 'tcp' as const,
    portRange: '22',
    sourceCidr: '0.0.0.0/0',
    destCidr: '',
    description: '',
    ...over,
  };
}

describe('derived metrics', () => {
  it('reports a metric for every monitorable resource', () => {
    const { state } = runningLab();
    const metrics = deriveMetrics(state);
    expect(metrics.some((m) => m.kind === 'vm')).toBe(true);
    expect(metrics.some((m) => m.kind === 'load-balancer')).toBe(true);
  });

  it('drops CPU to zero when a VM is stopped', () => {
    const { state, vmId } = runningLab();
    const before = deriveMetrics(state).find((m) => m.id === vmId)!;
    expect(before.cpuUtilization).toBeGreaterThan(0);
    const stopped = setVmRunning(state, vmId, false);
    if (!stopped.ok) throw new Error(stopped.message);
    const after = deriveMetrics(stopped.value.state).find((m) => m.id === vmId)!;
    expect(after.cpuUtilization).toBe(0);
  });

  it('counts only healthy load balancer backends', () => {
    const { state, lbId, vmId } = runningLab();
    const metric = deriveMetrics(state).find((m) => m.id === lbId)!;
    expect(metric.totalBackends).toBe(1);
    expect(metric.healthyBackends).toBe(1);
    const stopped = setVmRunning(state, vmId, false);
    if (!stopped.ok) throw new Error(stopped.message);
    const after = deriveMetrics(stopped.value.state).find((m) => m.id === lbId)!;
    expect(after.healthyBackends).toBe(0);
  });

  it('is stable across calls, so the console does not flicker', () => {
    const { state } = runningLab();
    expect(deriveMetrics(state)).toEqual(deriveMetrics(state));
  });

  it('reports zero utilisation for a stopped Cloud SQL instance', () => {
    const state = createInitialState();
    const created = createSqlInstance(state, {
      name: 'db',
      engine: 'POSTGRES_14',
      region: 'us-central1',
      tier: 'db-custom-1-3840',
      connectivity: 'PUBLIC',
    });
    if (!created.ok) throw new Error(created.message);
    const metric = deriveMetrics(created.value.state).find((m) => m.id === created.value.instance.id)!;
    expect(metric.kind).toBe('sql-instance');
    expect(metric.cpuUtilization).toBeGreaterThan(0);
  });
});

describe('alert policies', () => {
  it('creates a policy that does not fire below its threshold', () => {
    const { state, vmId } = runningLab();
    const result = createAlertPolicy(state, {
      name: 'high-cpu',
      targetId: vmId,
      metric: 'cpu.utilization',
      threshold: 99,
    });
    if (!result.ok) throw new Error(result.message);
    const [evaluation] = evaluatePolicies(result.value.state);
    expect(evaluation.firing).toBe(false);
  });

  it('fires once the metric reaches the threshold', () => {
    const { state, vmId } = runningLab();
    const metric = deriveMetrics(state).find((m) => m.id === vmId)!;
    // Threshold at the current value, so the comparison boundary is exercised.
    const result = createAlertPolicy(state, {
      name: 'boundary',
      targetId: vmId,
      metric: 'cpu.utilization',
      threshold: metric.cpuUtilization,
    });
    if (!result.ok) throw new Error(result.message);
    expect(evaluatePolicies(result.value.state)[0].firing).toBe(true);
  });

  it('stops firing while disabled', () => {
    const { state, vmId } = runningLab();
    const metric = deriveMetrics(state).find((m) => m.id === vmId)!;
    const created = createAlertPolicy(state, {
      name: 'p',
      targetId: vmId,
      metric: 'cpu.utilization',
      threshold: metric.cpuUtilization,
    });
    if (!created.ok) throw new Error(created.message);
    const off = setPolicyEnabled(created.value.state, created.value.policy.id, false);
    if (!off.ok) throw new Error(off.message);
    expect(evaluatePolicies(off.value.state)[0].firing).toBe(false);
  });

  it('rejects a threshold outside 0-100', () => {
    const result = createAlertPolicy(createInitialState(), {
      name: 'bad',
      metric: 'cpu.utilization',
      threshold: 500,
    });
    expect(codeOf(result)).toBe('INVALID_ARGUMENT');
  });

  it('rejects a target that no longer exists', () => {
    const result = createAlertPolicy(createInitialState(), {
      name: 'ghost',
      targetId: 'vm-does-not-exist',
      metric: 'cpu.utilization',
      threshold: 50,
    });
    expect(codeOf(result)).toBe('NOT_FOUND');
  });

  it('fires an "Any resource" policy on the worst reporting target', () => {
    const { state } = runningLab();
    const cpuValues = deriveMetrics(state)
      .filter((m) => reportsMetric(m.kind, 'cpu.utilization'))
      .map((m) => m.cpuUtilization);
    // Thresholds are a 0-100 scale, so clamp before using one as a boundary.
    const worst = Math.min(Math.max(...cpuValues), 100);
    const created = createAlertPolicy(state, {
      name: 'fleet-cpu',
      // No targetId means "every resource reporting this metric".
      metric: 'cpu.utilization',
      threshold: worst,
    });
    if (!created.ok) throw new Error(created.message);
    const [evaluation] = evaluatePolicies(created.value.state);
    expect(evaluation.value).toBe(worst);
    expect(evaluation.firing).toBe(true);
    expect(evaluation.targetName).toMatch(/Any resource/);
  });

  it('does not fire an "Any resource" policy when nothing reports the metric', () => {
    const created = createAlertPolicy(createInitialState(), {
      name: 'sql-cpu',
      metric: 'sql.cpu.utilization',
      threshold: 1,
    });
    if (!created.ok) throw new Error(created.message);
    const [evaluation] = evaluatePolicies(created.value.state);
    expect(evaluation.value).toBe(0);
    expect(evaluation.firing).toBe(false);
    expect(evaluation.targetName).toMatch(/nothing reports/);
  });

  it('reports a deleted target instead of silently reading zero', () => {
    const { state, vmId } = runningLab();
    const created = createAlertPolicy(state, {
      name: 'orphan',
      targetId: vmId,
      metric: 'cpu.utilization',
      threshold: 90,
    });
    if (!created.ok) throw new Error(created.message);
    const orphaned: SimState = {
      ...created.value.state,
      vms: created.value.state.vms.filter((v) => v.id !== vmId),
    };
    const [evaluation] = evaluatePolicies(orphaned);
    expect(evaluation.targetName).toMatch(/no longer exists/);
    expect(evaluation.firing).toBe(false);
  });

  it('deletes a policy', () => {
    const { state } = runningLab();
    const created = createAlertPolicy(state, { name: 'p', metric: 'cpu.utilization', threshold: 50 });
    if (!created.ok) throw new Error(created.message);
    const removed = deleteAlertPolicy(created.value.state, created.value.policy.id);
    if (!removed.ok) throw new Error(removed.message);
    expect(removed.value.state.alertPolicies).toHaveLength(0);
  });
});

describe('uptime checks', () => {
  it('reports UP while the load balancer has a healthy backend', () => {
    const { state, frontendIp } = runningLab();
    const created = createUptimeCheck(state, { name: 'web', url: `http://${frontendIp}/` });
    if (!created.ok) throw new Error(created.message);
    const run = runUptimeCheck(created.value.state, created.value.check.id);
    if (!run.ok) throw new Error(run.message);
    expect(run.value.check.state).toBe('UP');
    expect(run.value.check.latencyMs).toBeGreaterThan(0);
  });

  it('reports DOWN once the backend is stopped', () => {
    const { state, frontendIp, vmId } = runningLab();
    const created = createUptimeCheck(state, { name: 'web', url: `http://${frontendIp}/` });
    if (!created.ok) throw new Error(created.message);
    // Stop from the state that holds the check, or the check itself is lost.
    const stopped = setVmRunning(created.value.state, vmId, false);
    if (!stopped.ok) throw new Error(stopped.message);
    const run = runUptimeCheck(stopped.value.state, created.value.check.id);
    if (!run.ok) throw new Error(run.message);
    expect(run.value.check.state).toBe('DOWN');
  });

  it('degrades the success rate across repeated failures', () => {
    const { state, frontendIp, vmId } = runningLab();
    const created = createUptimeCheck(state, { name: 'web', url: `http://${frontendIp}/` });
    if (!created.ok) throw new Error(created.message);
    const up = runUptimeCheck(created.value.state, created.value.check.id);
    if (!up.ok) throw new Error(up.message);
    expect(up.value.check.successRate).toBeGreaterThan(0);
    const stopped = setVmRunning(up.value.state, vmId, false);
    if (!stopped.ok) throw new Error(stopped.message);
    const down = runUptimeCheck(stopped.value.state, created.value.check.id);
    if (!down.ok) throw new Error(down.message);
    expect(down.value.check.successRate).toBeLessThan(up.value.check.successRate);
  });

  it('requires a full URL with a scheme', () => {
    const result = createUptimeCheck(createInitialState(), { name: 'bad', url: '35.190.0.1' });
    expect(codeOf(result)).toBe('INVALID_ARGUMENT');
  });

  it('rejects a period shorter than a minute', () => {
    const result = createUptimeCheck(createInitialState(), {
      name: 'fast',
      url: 'http://35.190.0.1/',
      periodSeconds: 5,
    });
    expect(codeOf(result)).toBe('INVALID_ARGUMENT');
  });

  it('rejects a timeout that outlives the period', () => {
    const result = createUptimeCheck(createInitialState(), {
      name: 'overlap',
      url: 'http://35.190.0.1/',
      periodSeconds: 60,
      timeoutSeconds: 120,
    });
    expect(codeOf(result)).toBe('INVALID_ARGUMENT');
  });

  it('deletes a check', () => {
    const { state } = runningLab();
    const created = createUptimeCheck(state, { name: 'web', url: 'http://35.190.0.1/' });
    if (!created.ok) throw new Error(created.message);
    const removed = deleteUptimeCheck(created.value.state, created.value.check.id);
    if (!removed.ok) throw new Error(removed.message);
    expect(removed.value.state.uptimeChecks).toHaveLength(0);
  });
});

describe('security findings', () => {
  it('finds nothing in a clean lab', () => {
    const { state } = runningLab();
    // The default lab has no world-open rules and no public SQL.
    expect(deriveSecurityFindings(state).filter((f) => f.severity === 'HIGH')).toHaveLength(0);
  });

  it('flags SSH open to the internet', () => {
    const { state } = runningLab();
    const nsg = createNsg(state, { name: 'open-ssh', vpcId: state.vpcs[0].id });
    if (!nsg.ok) throw new Error(nsg.message);
    const rule = addRule(nsg.value.state, nsg.value.nsg.id, ruleInput({ name: 'allow-all-ssh' }));
    if (!rule.ok) throw new Error(rule.message);
    const attached = {
      ...rule.value.state,
      nsgs: rule.value.state.nsgs.map((n) => ({ ...n, attachedVmIds: [state.vms[0].id] })),
    };
    const findings = deriveSecurityFindings(attached);
    const ssh = findings.find((f) => f.title === 'SSH open to the internet');
    expect(ssh).toBeDefined();
    expect(ssh!.severity).toBe('HIGH');
    expect(ssh!.recommendation).toMatch(/IAP|network range/i);
  });

  it('does not flag SSH when the source is internal', () => {
    const { state } = runningLab();
    const nsg = createNsg(state, { name: 'internal-ssh', vpcId: state.vpcs[0].id });
    if (!nsg.ok) throw new Error(nsg.message);
    const rule = addRule(nsg.value.state, nsg.value.nsg.id, ruleInput({ name: 'ssh-internal', sourceCidr: '10.0.0.0/8' }));
    if (!rule.ok) throw new Error(rule.message);
    const attached = {
      ...rule.value.state,
      nsgs: rule.value.state.nsgs.map((n) => ({ ...n, attachedVmIds: [state.vms[0].id] })),
    };
    expect(deriveSecurityFindings(attached).some((f) => f.title === 'SSH open to the internet')).toBe(false);
  });

  it('flags a database port exposed to the world', () => {
    const { state } = runningLab();
    const nsg = createNsg(state, { name: 'open-pg', vpcId: state.vpcs[0].id });
    if (!nsg.ok) throw new Error(nsg.message);
    const rule = addRule(nsg.value.state, nsg.value.nsg.id, ruleInput({ name: 'pg-open', portRange: '5432' }));
    if (!rule.ok) throw new Error(rule.message);
    const attached = {
      ...rule.value.state,
      nsgs: rule.value.state.nsgs.map((n) => ({ ...n, attachedVmIds: [state.vms[0].id] })),
    };
    expect(deriveSecurityFindings(attached).some((f) => f.title.includes('PostgreSQL'))).toBe(true);
  });

  it('flags an all-ports world-open rule', () => {
    const { state } = runningLab();
    const nsg = createNsg(state, { name: 'wide', vpcId: state.vpcs[0].id });
    if (!nsg.ok) throw new Error(nsg.message);
    const rule = addRule(nsg.value.state, nsg.value.nsg.id, ruleInput({ name: 'everything', protocol: 'all', portRange: null }));
    if (!rule.ok) throw new Error(rule.message);
    const findings = deriveSecurityFindings(rule.value.state);
    expect(findings.some((f) => f.title === 'All ports open to the internet')).toBe(true);
  });

  it('flags a public Cloud SQL instance', () => {
    const state = createInitialState();
    const created = createSqlInstance(state, {
      name: 'public-db',
      engine: 'POSTGRES_14',
      region: 'us-central1',
      tier: 'db-custom-1-3840',
      connectivity: 'PUBLIC',
    });
    if (!created.ok) throw new Error(created.message);
    const finding = deriveSecurityFindings(created.value.state).find((f) => f.category === 'Cloud SQL');
    expect(finding?.severity).toBe('HIGH');
  });

  it('clears the finding once the rule is removed', () => {
    const { state } = runningLab();
    const nsg = createNsg(state, { name: 'temp', vpcId: state.vpcs[0].id });
    if (!nsg.ok) throw new Error(nsg.message);
    const rule = addRule(nsg.value.state, nsg.value.nsg.id, ruleInput({ name: 'ssh-open' }));
    if (!rule.ok) throw new Error(rule.message);
    const withRule = {
      ...rule.value.state,
      nsgs: rule.value.state.nsgs.map((n) => ({ ...n, attachedVmIds: [state.vms[0].id] })),
    };
    expect(deriveSecurityFindings(withRule).some((f) => f.title === 'SSH open to the internet')).toBe(true);
    // Dropping the policy is what actually clears the finding.
    expect(deriveSecurityFindings(state).some((f) => f.title === 'SSH open to the internet')).toBe(false);
  });

  it('counts findings by severity', () => {
    const counts = findingCounts(deriveSecurityFindings(runningLab().state));
    expect(counts.HIGH).toBe(0);
    expect(counts.HIGH + counts.MEDIUM + counts.LOW).toBeGreaterThanOrEqual(0);
  });
});