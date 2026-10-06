import type { SimState, AlertPolicy, UptimeCheck, SimResult, Vm } from './types';
import { ok, err } from './types';
import { nextId, logEvent, validateName, duplicateName, healthyBackends } from './engine';

/* ------------------------------------------------------------------ */
/* deterministic pseudo-metrics                                        */
/* ------------------------------------------------------------------ */

/**
 * Stable 0-1 hash of a string, so the console shows the same numbers for the
 * same resource across reloads instead of flickering on every render.
 */
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface TargetMetric {
  /** Resource id the metric belongs to. */
  id: string;
  name: string;
  kind: 'vm' | 'load-balancer' | 'cluster' | 'disk' | 'sql-instance';
  cpuUtilization: number;
  memoryUtilization: number;
  /** Used fraction of provisioned capacity, 0-100. */
  usedFraction: number;
  /** Number of healthy backends, for load balancers. */
  healthyBackends: number;
  totalBackends: number;
  /** Networks utilisation in bytes/s, derived from the traced traffic. */
  bytesSentPerSecond: number;
}

function vmMetric(state: SimState, vm: Vm): TargetMetric {
  const running = vm.status === 'RUNNING';
  const base = running ? 18 + hash01(vm.id) * 55 : 0;
  return {
    id: vm.id,
    name: vm.name,
    kind: 'vm',
    cpuUtilization: round1(base),
    memoryUtilization: round1(running ? 25 + hash01(`${vm.id}:mem`) * 60 : 0),
    // Disks hold no byte counters, so disk pressure is reported per disk and
    // a VM reports attachment count as its share of provisioned capacity.
    usedFraction: round1(vm.diskIds.length === 0 ? 0 : Math.min(100, vm.diskIds.length * 25)),
    healthyBackends: running ? 1 : 0,
    totalBackends: 1,
    bytesSentPerSecond: running ? Math.round(hash01(`${vm.id}:net`) * 900_000) : 0,
  };
}

/**
 * Build the metric set for everything the lab can monitor. Metrics are derived
 * from resource state rather than invented, so a stopped VM really does drop to
 * zero utilisation.
 */
export function deriveMetrics(state: SimState): TargetMetric[] {
  const metrics: TargetMetric[] = [];
  for (const vm of state.vms) metrics.push(vmMetric(state, vm));

  for (const lb of state.loadBalancers) {
    const healthy = healthyBackends(state, lb).length;
    metrics.push({
      id: lb.id,
      name: lb.name,
      kind: 'load-balancer',
      cpuUtilization: round1(5 + hash01(`${lb.id}:cpu`) * 30),
      memoryUtilization: round1(10 + hash01(`${lb.id}:mem`) * 35),
      usedFraction: round1(healthy),
      healthyBackends: healthy,
      totalBackends: lb.backendVmIds.length,
      bytesSentPerSecond: Math.round(hash01(`${lb.id}:net`) * 2_400_000),
    });
  }

  for (const cluster of state.k8sClusters) {
    const nodes = state.vms.filter((vm) => cluster.vmIds.includes(vm.id));
    const liveNodes = nodes.filter((vm) => vm.status === 'RUNNING');
    const running = liveNodes.length;
    const avgCpu =
      running === 0
        ? 0
        : liveNodes.reduce((sum, vm) => sum + 18 + hash01(vm.id) * 55, 0) / running;
    metrics.push({
      id: cluster.id,
      name: cluster.name,
      kind: 'cluster',
      cpuUtilization: round1(avgCpu),
      memoryUtilization: round1(running === 0 ? 0 : 30 + hash01(`${cluster.id}:mem`) * 50),
      usedFraction: round1(nodes.length === 0 ? 0 : (running / nodes.length) * 100),
      healthyBackends: running,
      totalBackends: nodes.length,
      bytesSentPerSecond: Math.round(hash01(`${cluster.id}:net`) * 1_800_000),
    });
  }

  for (const disk of state.disks) {
    metrics.push({
      id: disk.id,
      name: disk.name,
      kind: 'disk',
      cpuUtilization: 0,
      memoryUtilization: 0,
      // Unattached disks are idle; attached ones are fully in use by the VM.
      usedFraction: disk.attachedVmId ? 100 : 0,
      healthyBackends: 0,
      totalBackends: 0,
      bytesSentPerSecond: Math.round(hash01(`${disk.id}:io`) * 120_000),
    });
  }

  for (const instance of state.sqlInstances) {
    const running = instance.state === 'RUNNABLE';
    metrics.push({
      id: instance.id,
      name: instance.name,
      kind: 'sql-instance',
      cpuUtilization: round1(running ? 12 + hash01(`${instance.id}:cpu`) * 45 : 0),
      memoryUtilization: round1(running ? 35 + hash01(`${instance.id}:mem`) * 45 : 0),
      usedFraction: round1(Math.min(100, hash01(`${instance.id}:store`) * 80)),
      healthyBackends: running ? 1 : 0,
      totalBackends: 1,
      bytesSentPerSecond: running ? Math.round(hash01(`${instance.id}:net`) * 400_000) : 0,
    });
  }

  return metrics;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Metric name -> the accessor the policy compares against its threshold. */
const METRIC_READERS: Record<AlertPolicy['metric'], (m: TargetMetric) => number> = {
  'cpu.utilization': (m) => m.cpuUtilization,
  'memory.utilization': (m) => m.memoryUtilization,
  'loadBalancer.backendCount': (m) => m.healthyBackends,
  'disk.usedFraction': (m) => m.usedFraction,
  'sql.cpu.utilization': (m) => m.cpuUtilization,
};

/** Which resource kinds actually report a given metric. */
export const METRIC_KINDS: Record<AlertPolicy['metric'], TargetMetric['kind'][]> = {
  'cpu.utilization': ['vm', 'cluster', 'sql-instance'],
  'memory.utilization': ['vm', 'cluster', 'sql-instance'],
  'disk.usedFraction': ['vm', 'disk'],
  'loadBalancer.backendCount': ['load-balancer'],
  'sql.cpu.utilization': ['sql-instance'],
};

/** True when this resource kind carries readings for the metric. */
export function reportsMetric(kind: TargetMetric['kind'], metric: AlertPolicy['metric']): boolean {
  return METRIC_KINDS[metric].includes(kind);
}

export interface PolicyEvaluation {
  policy: AlertPolicy;
  /** Current value of the watched metric, in percent. */
  value: number;
  firing: boolean;
  targetName: string;
}

/**
 * Evaluate every policy against current metrics. A policy fires when its metric
 * is at or above the threshold; the duration window is reported so learners can
 * see why a spike that clears quickly would not page anyone.
 */
export function evaluatePolicies(state: SimState): PolicyEvaluation[] {
  const metrics = deriveMetrics(state);
  return state.alertPolicies.map((policy) => {
    // A policy with no target watches every resource that reports this metric
    // and fires on the worst one. Falling back to 0 there would mean an
    // "Any resource" policy could never fire at all.
    const readings = policy.targetId
      ? metrics
          .filter((m) => m.id === policy.targetId)
          .map((m) => METRIC_READERS[policy.metric](m))
      : metrics
          .filter((m) => reportsMetric(m.kind, policy.metric))
          .map((m) => METRIC_READERS[policy.metric](m));
    const value = readings.length > 0 ? Math.max(...readings) : 0;
    const target = policy.targetId ? metrics.find((m) => m.id === policy.targetId) : undefined;
    return {
      policy,
      value: round1(value),
      firing: policy.enabled && value >= policy.threshold,
      targetName: policy.targetId
        ? (target?.name ?? '(target no longer exists)')
        : readings.length > 0
          ? `Any resource (worst of ${readings.length})`
          : 'Any resource (nothing reports this metric)',
    };
  });
}

/* ------------------------------------------------------------------ */
/* alert policies                                                      */
/* ------------------------------------------------------------------ */

export const METRIC_LABELS: Record<AlertPolicy['metric'], string> = {
  'cpu.utilization': 'CPU utilisation (%)',
  'memory.utilization': 'Memory utilisation (%)',
  'loadBalancer.backendCount': 'Healthy backends',
  'disk.usedFraction': 'Disk used (%)',
  'sql.cpu.utilization': 'Cloud SQL CPU utilisation (%)',
};

export function createAlertPolicy(
  state: SimState,
  input: {
    name: string;
    targetId?: string;
    metric: AlertPolicy['metric'];
    threshold: number;
    durationSeconds?: number;
    severity?: AlertPolicy['severity'];
  }
): SimResult<{ state: SimState; policy: AlertPolicy }> {
  const problem = validateName(input.name, 'alert policy');
  if (problem) return problem;
  if (duplicateName(state.alertPolicies, input.name, 'alert policy')) {
    return err('DUPLICATE_NAME', `Alert policy "${input.name}" already exists.`, 'Pick a different policy name.');
  }
  if (!Number.isFinite(input.threshold) || input.threshold < 0 || input.threshold > 100) {
    return err('INVALID_ARGUMENT', 'Threshold must be between 0 and 100.', 'Set a threshold in the 0-100 range.');
  }
  if (input.targetId) {
    const exists = deriveMetrics(state).some((m) => m.id === input.targetId);
    if (!exists) return err('NOT_FOUND', 'The selected target no longer exists.', 'Pick a resource that still exists.');
  }
  const idResult = nextId(state, 'alert');
  const policy: AlertPolicy = {
    id: idResult.id,
    name: input.name,
    targetId: input.targetId,
    metric: input.metric,
    threshold: input.threshold,
    durationSeconds: input.durationSeconds ?? 60,
    severity: input.severity ?? 'WARNING',
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  const next = { ...idResult.state, alertPolicies: [...idResult.state.alertPolicies, policy] };
  return ok(
    { state: logEvent(next, 'monitoring.alertPolicies.create', `alertPolicies/${input.name}`, 'SUCCESS'), policy },
    `Alert policy "${input.name}" created.`
  );
}

export function setPolicyEnabled(
  state: SimState,
  id: string,
  enabled: boolean
): SimResult<{ state: SimState }> {
  const policy = state.alertPolicies.find((p) => p.id === id);
  if (!policy) return err('NOT_FOUND', 'Alert policy not found.', 'Refresh the list; it may already be deleted.');
  const next = {
    ...state,
    alertPolicies: state.alertPolicies.map((p) => (p.id === id ? { ...p, enabled } : p)),
  };
  return ok(
    { state: logEvent(next, 'monitoring.alertPolicies.patch', `alertPolicies/${policy.name}`, 'SUCCESS', `enabled=${enabled}`) },
    `Alert policy "${policy.name}" ${enabled ? 'enabled' : 'disabled'}.`
  );
}

export function deleteAlertPolicy(state: SimState, id: string): SimResult<{ state: SimState }> {
  const policy = state.alertPolicies.find((p) => p.id === id);
  if (!policy) return err('NOT_FOUND', 'Alert policy not found.', 'Refresh the list; it may already be deleted.');
  const next = {
    ...state,
    alertPolicies: state.alertPolicies.filter((p) => p.id !== id),
  };
  return ok(
    { state: logEvent(next, 'monitoring.alertPolicies.delete', `alertPolicies/${policy.name}`, 'SUCCESS') },
    `Alert policy "${policy.name}" deleted.`
  );
}

/* ------------------------------------------------------------------ */
/* uptime checks                                                       */
/* ------------------------------------------------------------------ */

export function createUptimeCheck(
  state: SimState,
  input: {
    name: string;
    url: string;
    periodSeconds?: number;
    timeoutSeconds?: number;
  }
): SimResult<{ state: SimState; check: UptimeCheck }> {
  const problem = validateName(input.name, 'uptime check');
  if (problem) return problem;
  if (duplicateName(state.uptimeChecks, input.name, 'uptime check')) {
    return err('DUPLICATE_NAME', `Uptime check "${input.name}" already exists.`, 'Pick a different check name.');
  }
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return err('INVALID_ARGUMENT', 'Enter a full URL including the scheme.', 'For example http://35.190.0.1/health');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return err('INVALID_ARGUMENT', 'Only http and https URLs can be checked.', 'Start the URL with http:// or https://');
  }
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
  const period = input.periodSeconds ?? 60;
  if (period < 60) {
    return err('INVALID_ARGUMENT', 'The check period must be at least 60 seconds.', 'GCP does not poll more often than once a minute.');
  }
  const timeout = input.timeoutSeconds ?? 10;
  if (timeout >= period) {
    return err('INVALID_ARGUMENT', 'Timeout must be shorter than the check period.', 'A timeout that outlives the period would overlap checks.');
  }

  const idResult = nextId(state, 'uptime');
  const check: UptimeCheck = {
    id: idResult.id,
    name: input.name,
    url: input.url,
    host: parsed.hostname,
    path: parsed.pathname === '/' ? '/' : parsed.pathname,
    port,
    periodSeconds: period,
    timeoutSeconds: timeout,
    successRate: 0,
    latencyMs: 0,
    state: 'UNKNOWN',
  };
  const next = { ...idResult.state, uptimeChecks: [...idResult.state.uptimeChecks, check] };
  return ok(
    { state: logEvent(next, 'monitoring.uptime.create', `uptimeCheckConfigs/${input.name}`, 'SUCCESS'), check },
    `Uptime check "${input.name}" created. Run it to record the first result.`
  );
}

/**
 * Run an uptime check against the lab. Success depends on a load balancer with
 * that address having at least one healthy backend, which is why a real teardown
 * takes a check down instead of leaving it reassuringly green.
 */
export function runUptimeCheck(state: SimState, id: string): SimResult<{ state: SimState; check: UptimeCheck }> {
  const check = state.uptimeChecks.find((c) => c.id === id);
  if (!check) return err('NOT_FOUND', 'Uptime check not found.', 'Refresh the list; it may already be deleted.');

  const lb = state.loadBalancers.find((l) => l.frontendIp === check.host);
  const healthy = lb ? healthyBackends(state, lb).length : 0;
  const up = healthy > 0;

  const seed = hash01(`${check.id}:${state.events.length}:${lb?.id ?? 'none'}`);
  const latency = up ? Math.round(20 + seed * 180) : 0;
  // A down check drags the rolling success rate down by one interval step.
  const successRate = up
    ? Math.min(100, Math.round(check.successRate + (100 - check.successRate) * 0.3))
    : Math.max(0, Math.round(check.successRate - 25));

  const updated: UptimeCheck = {
    ...check,
    state: up ? 'UP' : 'DOWN',
    latencyMs: latency,
    successRate,
    lastCheckAt: new Date().toISOString(),
  };
  const next: SimState = {
    ...state,
    uptimeChecks: state.uptimeChecks.map((c) => (c.id === id ? updated : c)),
  };
  return ok(
    { state: logEvent(next, 'monitoring.uptime.run', `uptimeCheckConfigs/${check.name}`, up ? 'SUCCESS' : 'FAILED', up ? `${latency}ms` : 'no healthy backend'), check: updated },
    up
      ? `"${check.name}" is UP in ${latency} ms (${successRate}% success).`
      : `"${check.name}" is DOWN: no healthy backend is serving ${check.host}.`
  );
}

export function deleteUptimeCheck(state: SimState, id: string): SimResult<{ state: SimState }> {
  const check = state.uptimeChecks.find((c) => c.id === id);
  if (!check) return err('NOT_FOUND', 'Uptime check not found.', 'Refresh the list; it may already be deleted.');
  const next = { ...state, uptimeChecks: state.uptimeChecks.filter((c) => c.id !== id) };
  return ok(
    { state: logEvent(next, 'monitoring.uptime.delete', `uptimeCheckConfigs/${check.name}`, 'SUCCESS') },
    `Uptime check "${check.name}" deleted.`
  );
}