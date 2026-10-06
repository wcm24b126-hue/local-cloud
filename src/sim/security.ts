import type { SimState, Nsg, Rule, Vm, Vpc, LoadBalancer, SqlInstance } from './types';
import { healthyBackends } from './engine';

/* ------------------------------------------------------------------ */
/* findings model                                                      */
/* ------------------------------------------------------------------ */

export type FindingSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SecurityFinding {
  /** Stable per-finding identifier, as SCC provides for suppression rules. */
  id: string;
  category: string;
  title: string;
  severity: FindingSeverity;
  /** Resource the finding applies to. */
  resourceId: string;
  resourceLabel: string;
  /** What is wrong, in plain language. */
  description: string;
  /** What a learner should change to clear it. */
  recommendation: string;
  /** Effective firewall rule names that cause the exposure, if any. */
  relatedRules: string[];
}

/* ------------------------------------------------------------------ */
/* rule evaluation helpers                                             */
/* ------------------------------------------------------------------ */

/** RFC1918 ranges that must not be open to the internet. */
function isInternalCidr(cidr: string): boolean {
  return cidr.startsWith('10.') || cidr.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(cidr);
}

/** A rule only opens a port when it allows ingress from the whole internet. */
function ruleAllowsWorld(rule: Rule): boolean {
  return rule.direction === 'ingress' && rule.action === 'allow' && rule.sourceCidr === '0.0.0.0/0';
}

/**
 * Ports a rule covers. A null portRange means every port, which is what GCP
 * treats as "all ports" and what makes a rule dangerous.
 */
function rulePortRange(rule: Rule): [number, number] {
  if (rule.portRange === null || rule.portRange === 'all') return [0, 65535];
  const parts = rule.portRange.split('-');
  const from = Number(parts[0]);
  const to = parts.length > 1 ? Number(parts[1]) : from;
  return [from, to];
}

/** Ports that should never be reachable from the internet. */
const SENSITIVE_PORTS: Record<string, { port: string; why: string }> = {
  '22': { port: '22', why: 'SSH' },
  '3389': { port: '3389', why: 'RDP' },
  '3306': { port: '3306', why: 'MySQL' },
  '5432': { port: '5432', why: 'PostgreSQL' },
  '6379': { port: '6379', why: 'Redis' },
  '27017': { port: '27017', why: 'MongoDB' },
};

/* ------------------------------------------------------------------ */
/* individual detectors                                                */
/* ------------------------------------------------------------------ */

function openSshFindings(vm: Vm, nsgs: Nsg[]): SecurityFinding[] {
  if (vm.status !== 'RUNNING') return [];
  const findings: SecurityFinding[] = [];
  for (const nsg of nsgs) {
    for (const rule of nsg.rules) {
      const [from, to] = rulePortRange(rule);
      if (from <= 22 && 22 <= to && ruleAllowsWorld(rule)) {
        findings.push({
          id: `nsg-open-ssh-${vm.id}-${nsg.id}-${rule.id}`,
          category: 'VPC firewall',
          title: 'SSH open to the internet',
          severity: 'HIGH',
          resourceId: vm.id,
          resourceLabel: vm.name,
          description: `Firewall policy "${nsg.name}" allows SSH from 0.0.0.0/0 to ${vm.name}, so anyone can attempt a login.`,
          recommendation: `Limit the source to IAP (35.235.240.0/20) or your own network range on policy "${nsg.name}".`,
          relatedRules: [`${nsg.name}/${rule.name}`],
        });
      }
    }
  }
  return findings;
}

function databasePortFindings(vm: Vm, nsgs: Nsg[]): SecurityFinding[] {
  if (vm.status !== 'RUNNING') return [];
  const findings: SecurityFinding[] = [];
  for (const nsg of nsgs) {
    for (const rule of nsg.rules) {
      if (!ruleAllowsWorld(rule)) continue;
      const [from, to] = rulePortRange(rule);
      // Bounding the walk keeps an "all ports" rule from costing 65k iterations.
      for (let port = from; port <= Math.min(to, 65535); port += 1) {
        const sensitive = SENSITIVE_PORTS[String(port)];
        if (!sensitive) continue;
        findings.push({
          id: `nsg-open-${port}-${vm.id}-${nsg.id}-${rule.id}`,
          category: 'VPC firewall',
          title: `${sensitive.why} open to the internet`,
          severity: 'HIGH',
          resourceId: vm.id,
          resourceLabel: vm.name,
          description: `Firewall policy "${nsg.name}" exposes port ${port} (${sensitive.why}) to the whole internet on ${vm.name}.`,
          recommendation: `Restrict port ${port} to known client networks, or remove the rule if it is no longer needed.`,
          relatedRules: [`${nsg.name}/${rule.name}`],
        });
      }
    }
  }
  return findings;
}

function overlyBroadIngressFindings(vpc: Vpc, nsgs: Nsg[]): SecurityFinding[] {
  const broad = nsgs
    .filter((n) => n.vpcId === vpc.id)
    .flatMap((n) => {
      const wide = n.rules.filter((r) => {
        if (!ruleAllowsWorld(r)) return false;
        const [from, to] = rulePortRange(r);
        return from === 0 && to === 65535;
      });
      return wide;
    });
  if (broad.length === 0) return [];
  return [
    {
      id: `vpc-all-ports-open-${vpc.id}`,
      category: 'VPC firewall',
      title: 'All ports open to the internet',
      severity: 'HIGH',
      resourceId: vpc.id,
      resourceLabel: vpc.name,
      description: `Network "${vpc.name}" has ${broad.length} firewall rule(s) allowing every port from 0.0.0.0/0.`,
      recommendation: 'Allow only the ports your services need, and restrict sources to known networks.',
      relatedRules: broad.map((r) => r.name),
    },
  ];
}

function publicIpFindings(vm: Vm): SecurityFinding[] {
  if (!vm.externalIp) return [];
  return [
    {
      id: `vm-public-ip-${vm.id}`,
      category: 'Virtual machines',
      title: 'VM has a public IP address',
      severity: 'MEDIUM',
      resourceId: vm.id,
      resourceLabel: vm.name,
      description: `${vm.name} has external address ${vm.externalIp}, so it is directly reachable from the internet.`,
      recommendation: 'Remove the external IP and reach the VM through a load balancer or an SSH tunnel via IAP.',
      relatedRules: [],
    },
  ];
}

function httpLoadBalancerFindings(state: SimState, lb: LoadBalancer): SecurityFinding[] {
  if (lb.type !== 'external-http') return [];
  if (lb.port !== 80) return [];
  const healthy = healthyBackends(state, lb).length;
  if (healthy === 0) {
    return [
      {
        id: `lb-no-backend-${lb.id}`,
        category: 'Load balancing',
        title: 'Load balancer has no healthy backend',
        severity: 'MEDIUM',
        resourceId: lb.id,
        resourceLabel: lb.name,
        description: `"${lb.name}" serves plain HTTP on port 80 and currently has no healthy backend.`,
        recommendation: 'Attach running VMs to the backend group, or delete the load balancer if it is unused.',
        relatedRules: [],
      },
    ];
  }
  return [];
}

function publicSqlFindings(instance: SqlInstance): SecurityFinding[] {
  if (!instance.publicIp) return [];
  return [
    {
      id: `sql-public-ip-${instance.id}`,
      category: 'Cloud SQL',
      title: 'Database has a public IP',
      severity: 'HIGH',
      resourceId: instance.id,
      resourceLabel: instance.name,
      description: `Instance "${instance.name}" is reachable from the internet at ${instance.publicIp}.`,
      recommendation: 'Switch the instance to Private IP and connect through Cloud SQL Auth Proxy or the VPC connector.',
      relatedRules: [],
    },
  ];
}

/* ------------------------------------------------------------------ */
/* public entry point                                                  */
/* ------------------------------------------------------------------ */

/**
 * Derive Security Command Center style findings from current state. Findings are
 * computed from real resources, so fixing a firewall rule genuinely clears the
 * finding rather than hiding it.
 */
export function deriveSecurityFindings(state: SimState): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const vpc of state.vpcs) {
    findings.push(...overlyBroadIngressFindings(vpc, state.nsgs));
  }

  for (const vm of state.vms) {
    // Only policies actually attached to the VM can expose it.
    const nsgs = state.nsgs.filter(
      (n) => n.vpcId === vm.vpcId && (n.attachedVmIds.includes(vm.id) || vm.nsgIds.includes(n.id))
    );
    findings.push(...openSshFindings(vm, nsgs));
    findings.push(...databasePortFindings(vm, nsgs));
    findings.push(...publicIpFindings(vm));
  }

  for (const lb of state.loadBalancers) {
    findings.push(...httpLoadBalancerFindings(state, lb));
  }

  for (const instance of state.sqlInstances) {
    findings.push(...publicSqlFindings(instance));
  }

  const severityRank: Record<FindingSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return findings.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title)
  );
}

export function findingCounts(findings: SecurityFinding[]): Record<FindingSeverity, number> {
  return {
    HIGH: findings.filter((f) => f.severity === 'HIGH').length,
    MEDIUM: findings.filter((f) => f.severity === 'MEDIUM').length,
    LOW: findings.filter((f) => f.severity === 'LOW').length,
  };
}

/** Exported so the console can explain the ranges it treats as internal. */
export function isInternalRange(cidr: string): boolean {
  return isInternalCidr(cidr);
}