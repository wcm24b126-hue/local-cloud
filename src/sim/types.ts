/**
 * Domain model for the LocalCloud networking lab simulator.
 *
 * This module is the single source of truth for resource shapes. It is pure
 * TypeScript with no framework imports so the engine, the UI and the tests all
 * agree on the same types.
 */

export interface Project {
  id: string;
  name: string;
  projectNumber: string;
  createdAt: string;
}

export type VpcStatus = 'CREATING' | 'READY' | 'DELETING' | 'DELETED';
export type RoutingMode = 'regional' | 'global';

export interface Vpc {
  id: string;
  name: string;
  mode: 'custom';
  routingMode: RoutingMode;
  createdAt: string;
  status: VpcStatus;
}

export type SubnetStatus = 'CREATING' | 'READY' | 'DELETING' | 'DELETED';

export interface Subnet {
  id: string;
  name: string;
  vpcId: string;
  region: string;
  cidr: string;
  /** GCP reserves the first two and last addresses of the range. */
  gatewayIp: string;
  usedIps: string[];
  status: SubnetStatus;
  createdAt: string;
}

export type VmStatus = 'PROVISIONING' | 'RUNNING' | 'TERMINATED' | 'DELETING' | 'DELETED';

export interface Vm {
  id: string;
  name: string;
  vpcId: string;
  subnetId: string;
  zone: string;
  machineType: string;
  internalIp: string;
  externalIp?: string;
  networkTags: string[];
  diskIds: string[];
  nsgIds: string[];
  status: VmStatus;
  createdAt: string;
}

export type DiskStatus = 'CREATING' | 'READY' | 'ATTACHING' | 'ATTACHED' | 'DELETING' | 'DELETED';

export interface Disk {
  id: string;
  name: string;
  vpcId: string;
  zone: string;
  sizeGb: number;
  type: 'pd-standard' | 'pd-balanced' | 'pd-ssd';
  attachedVmId: string | null;
  isBootDisk: boolean;
  status: DiskStatus;
  createdAt: string;
}

export type GatewayStatus = 'CREATING' | 'READY' | 'ATTACHING' | 'ATTACHED' | 'DELETING' | 'DELETED';

export interface InternetGateway {
  id: string;
  name: string;
  vpcId: string;
  status: GatewayStatus;
  createdAt: string;
}

export type RouteNextHop = 'local' | 'internet-gateway' | 'vm';

export interface Route {
  id: string;
  vpcId: string;
  name: string;
  destCidr: string;
  nextHop: RouteNextHop;
  nextHopRefId?: string;
  priority: number;
  /** Implicit routes (auto-created locals and the 0.0.0.0/0 default) are not user-deletable. */
  isImplicit: boolean;
  createdAt: string;
}

export type LoadBalancerType = 'external-http' | 'internal-tcp';
export type LoadBalancerStatus = 'CREATING' | 'PROVISIONING' | 'RUNNING' | 'DELETING' | 'DELETED';

export interface HealthCheck {
  port: number;
  path: string;
  intervalSec: number;
}

export interface LoadBalancer {
  id: string;
  name: string;
  type: LoadBalancerType;
  vpcId: string;
  frontendIp: string;
  port: number;
  protocol: 'tcp' | 'http';
  backendVmIds: string[];
  healthCheck: HealthCheck;
  status: LoadBalancerStatus;
  createdAt: string;
}

export type NsgStatus = 'CREATING' | 'READY' | 'DELETING' | 'DELETED';

export interface Nsg {
  id: string;
  name: string;
  vpcId: string;
  attachedVmIds: string[];
  attachedSubnetIds: string[];
  rules: Rule[];
  status: NsgStatus;
  createdAt: string;
}

export type RuleDirection = 'ingress' | 'egress';
export type RuleAction = 'allow' | 'deny';
export type RuleProtocol = 'tcp' | 'udp' | 'icmp' | 'all';

export interface Rule {
  id: string;
  nsgId: string;
  name: string;
  direction: RuleDirection;
  action: RuleAction;
  /** 0-65535, lower is evaluated first. GCP reserves 0-65534 for rules; 65535 is the implicit rule. */
  priority: number;
  protocol: RuleProtocol;
  /** Single port "80", inclusive range "8000-8100", or "all". Null means all ports. */
  portRange: string | null;
  /** Ingress only: source CIDR. */
  sourceCidr: string;
  /** Egress only: destination CIDR. */
  destCidr: string;
  description: string;
}

export interface EventLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  result: 'SUCCESS' | 'FAILED';
  detail?: string;
}

export interface TraceRecord {
  id: string;
  timestamp: string;
  packet: Packet;
  result: TraceResult;
}

export interface SimState {
  project: Project;
  vpcs: Vpc[];
  subnets: Subnet[];
  vms: Vm[];
  disks: Disk[];
  gateways: InternetGateway[];
  routes: Route[];
  loadBalancers: LoadBalancer[];
  nsgs: Nsg[];
  events: EventLogEntry[];
  traces: TraceRecord[];
  /** Monotonic counter used for deterministic ID generation and LB round-robin. */
  sequence: number;
}

/* ------------------------------------------------------------------ */
/* Packet tracer                                                       */
/* ------------------------------------------------------------------ */

export interface Packet {
  sourceIp: string;
  destIp: string;
  protocol: 'tcp' | 'udp' | 'icmp';
  destPort?: number;
  sourcePort?: number;
}

export type TraceComponent =
  | 'source'
  | 'subnet'
  | 'route-table'
  | 'internet-gateway'
  | 'load-balancer'
  | 'nsg-egress'
  | 'nsg-ingress'
  | 'vm'
  | 'destination';

export type TraceDecision = 'PASS' | 'DROP' | 'INFO';

export interface TraceHop {
  order: number;
  component: TraceComponent;
  label: string;
  decision: TraceDecision;
  reason: string;
  matchedRuleId?: string;
  resourceId?: string;
  /** Plain-English remediation shown when this hop drops the packet. */
  fix?: string;
}

export interface TraceResult {
  verdict: 'ALLOWED' | 'BLOCKED';
  blockedAt?: string;
  hops: TraceHop[];
  summary: string;
}

/* ------------------------------------------------------------------ */
/* Engine input / output                                               */
/* ------------------------------------------------------------------ */

export type SimErrorCode =
  | 'INVALID_NAME'
  | 'DUPLICATE_NAME'
  | 'NOT_FOUND'
  | 'INVALID_CIDR'
  | 'CIDR_OUT_OF_RANGE'
  | 'CIDR_OVERLAP'
  | 'CIDR_NOT_PRIVATE'
  | 'NOT_READY'
  | 'DEPENDENCY'
  | 'INVALID_STATE'
  | 'INVALID_ARGUMENT'
  | 'NO_HEALTHY_BACKEND'
  | 'IP_EXHAUSTED';

export interface SimError {
  ok: false;
  code: SimErrorCode;
  /** What went wrong. */
  message: string;
  /** What the learner should do next. */
  howToFix: string;
}

export interface SimOk<T> {
  ok: true;
  value: T;
  /** Human-readable summary for the toast and event log. */
  message: string;
}

export type SimResult<T> = SimOk<T> | SimError;

export const ok = <T,>(value: T, message: string): SimOk<T> => ({ ok: true, value, message });

export const err = (
  code: SimErrorCode,
  message: string,
  howToFix: string
): SimError => ({ ok: false, code, message, howToFix });