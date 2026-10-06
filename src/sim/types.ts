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

/* ------------------------------------------------------------------ */
/* Disk snapshots                                                       */
/* ------------------------------------------------------------------ */

/**
 * A point-in-time copy of a persistent disk.
 *
 * GCP does not replicate volumes between zones or regions: regional disks are
 * the closest thing, and a snapshot is the portable copy. Snapshots are modelled
 * as global objects that can create a new disk in any zone.
 */
export interface DiskSnapshot {
  id: string;
  name: string;
  sourceDiskId: string;
  sizeGb: number;
  type: Disk['type'];
  /** Storage class, mirroring GCS snapshot storage classes. */
  storageClass: 'STANDARD' | 'NEARLINE' | 'COLDLINE' | 'ARCHIVE';
  status: 'CREATING' | 'READY' | 'DELETING' | 'DELETED';
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Instance templates and managed instance groups                      */
/* ------------------------------------------------------------------ */

/** The machine shape a group clones. Mirrors a GCP instance template. */
export interface InstanceTemplate {
  id: string;
  name: string;
  vpcId: string;
  subnetId: string;
  zone: string;
  machineType: string;
  networkTags: string[];
  /** Boot disk size the template provisions for each clone. */
  bootDiskSizeGb: number;
  withExternalIp: boolean;
  status: 'CREATING' | 'READY' | 'DELETING' | 'DELETED';
  createdAt: string;
}

/**
 * A managed instance group: a target size the platform maintains by creating or
 * deleting VMs from an instance template. Autoscaling is expressed as the target
 * plus optional min/max bounds, which is how GCP models it too.
 */
export interface InstanceGroup {
  id: string;
  name: string;
  templateId: string;
  targetSize: number;
  minSize: number;
  maxSize: number;
  /** Ids of the VMs the group currently owns, in creation order. */
  vmIds: string[];
  status: 'CREATING' | 'STABLE' | 'SCALING' | 'DELETING' | 'DELETED';
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

/* ------------------------------------------------------------------ */
/* Kubernetes Engine                                                  */
/* ------------------------------------------------------------------ */

/**
 * A simulated GKE cluster.
 *
 * The important modelling decision is that a cluster's nodes are real VM
 * instances in the lab's VPC rather than a separate invented resource. That
 * means the packet tracer, the topology graph and the firewall policies all
 * work against a cluster without any special cases: a blocked kubelet port
 * shows up as a blocked packet, exactly as it would on a real network.
 */
export interface K8sCluster {
  id: string;
  name: string;
  vpcId: string;
  /** Subnet the control plane and nodes are attached to. */
  subnetId: string;
  region: string;
  zone: string;
  machineType: string;
  version: string;
  nodeCount: number;
  minNodeCount: number;
  maxNodeCount: number;
  /** Backing VM instances, in creation order. */
  vmIds: string[];
  /** Simulated API server address the control plane is reachable on. */
  endpoint: string;
  /** Node network tag, which firewall policies key off. */
  networkTag: string;
  status: 'PROVISIONING' | 'RUNNING' | 'RECONCILING' | 'DELETING' | 'DELETED' | 'ERROR';
  createdAt: string;
}

export interface K8sNamespace {
  id: string;
  name: string;
  clusterId: string;
  labels: Record<string, string>;
  status: 'ACTIVE' | 'TERMINATING';
  createdAt: string;
}

/**
 * A Deployment owns a number of replicas of a container image.
 *
 * Pods themselves are derived from the deployment rather than stored, so a
 * replica count and the list of pods can never disagree.
 */
export interface K8sDeployment {
  id: string;
  name: string;
  clusterId: string;
  namespaceId: string;
  replicas: number;
  image: string;
  containerPort: number;
  /** Selector labels; services match on these to build their endpoints. */
  labels: Record<string, string>;
  env: Record<string, string>;
  /** Optional persistent volume claim bound to the replicas. */
  pvcId?: string;
  readyReplicas: number;
  /** Bumped on every image change, mirroring the revision history concept. */
  revision: number;
  status: 'PROVISIONING' | 'RUNNING' | 'UPDATING' | 'DEGRADED' | 'DELETING' | 'DELETED';
  createdAt: string;
}

/** A Service load-balances across the pods its selector matches. */
export interface K8sService {
  id: string;
  name: string;
  clusterId: string;
  namespaceId: string;
  type: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  clusterIp: string;
  nodePort?: number;
  /** Allocated only for LoadBalancer services. */
  externalIp?: string;
  selector: Record<string, string>;
  port: number;
  targetPort: number;
  protocol: 'TCP' | 'UDP';
  /** Load balancer provisioned in the VPC, for LoadBalancer services and gateways. */
  lbId?: string;
  status: 'PENDING' | 'RUNNING' | 'DELETING' | 'DELETED';
  createdAt: string;
}

/** An Ingress routes host/path traffic to a Service inside the cluster. */
export interface K8sIngress {
  id: string;
  name: string;
  clusterId: string;
  namespaceId: string;
  /** Host rule; "*" accepts any Host header. */
  host: string;
  path: string;
  serviceId: string;
  servicePort: number;
  tls: boolean;
  status: 'PROVISIONING' | 'RUNNING' | 'DELETING' | 'DELETED';
  createdAt: string;
}

/**
 * A Gateway is the GKE Gateway API resource that fronts one or more Services.
 *
 * Creating one provisions a real load balancer in the lab VPC and opens the
 * firewall rules that load balancer needs, so the traffic path a learner
 * inspects is the same path the simulator actually evaluates.
 */
export interface K8sGateway {
  id: string;
  name: string;
  clusterId: string;
  namespaceId: string;
  className: 'gke-l7-global-external' | 'gke-l7-regional-internal-external';
  /** Services routed by this gateway, with the port each receives on. */
  routes: { serviceId: string; port: number }[];
  listenerPort: number;
  tls: boolean;
  /** Frontend address of the provisioned load balancer. */
  address?: string;
  /** Load balancer provisioned in the lab VPC. */
  lbId?: string;
  /**
   * Second frontend for a regional gateway: the internal load balancer that
   * serves in-VPC clients. Tracked separately so cluster teardown reclaims it.
   */
  internalLbId?: string;
  status: 'PROVISIONING' | 'RUNNING' | 'DELETING' | 'DELETED';
  createdAt: string;
}

export interface K8sConfigMap {
  id: string;
  name: string;
  clusterId: string;
  namespaceId: string;
  data: Record<string, string>;
  status: 'ACTIVE' | 'DELETING';
  createdAt: string;
}

export interface K8sSecret {
  id: string;
  name: string;
  clusterId: string;
  namespaceId: string;
  type: 'Opaque' | 'kubernetes.io/basic-auth';
  /**
   * Base64-ish encoded values, as Kubernetes stores them. These are simulated
   * credentials for the lab and are never real secrets.
   */
  data: Record<string, string>;
  status: 'ACTIVE' | 'DELETING';
  createdAt: string;
}

export interface K8sPersistentVolumeClaim {
  id: string;
  name: string;
  clusterId: string;
  namespaceId: string;
  storageGb: number;
  accessMode: 'ReadWriteOnce' | 'ReadWriteMany';
  /** Persistent disk backing the claim. */
  diskId?: string;
  status: 'PENDING' | 'BOUND' | 'RELEASED' | 'DELETING';
  createdAt: string;
}

/** Horizontal Pod Autoscaler: keeps a deployment inside a CPU-driven range. */
export interface K8sAutoscaler {
  id: string;
  name: string;
  clusterId: string;
  namespaceId: string;
  deploymentId: string;
  minReplicas: number;
  maxReplicas: number;
  /** Target average CPU utilisation percentage that triggers a scale event. */
  targetCpuUtilization: number;
  /** Simulated current utilisation, used to decide the autoscaler's action. */
  currentCpuUtilization: number;
  lastScaleAt?: string;
  status: 'ACTIVE' | 'DELETING';
  createdAt: string;
}

/**
 * A pod, derived from its Deployment rather than stored in the state.
 *
 * Keeping pods derived means the replica count and the pod list are always the
 * same fact expressed twice, so they cannot drift apart.
 */
export interface K8sPod {
  name: string;
  deploymentId: string;
  namespace: string;
  phase: 'Running' | 'Pending' | 'CrashLoopBackOff' | 'Terminating';
  ip: string;
  nodeVmId?: string;
  ready: boolean;
}

/* ------------------------------------------------------------------ */
/* Cloud SQL and AlloyDB                                              */
/* ------------------------------------------------------------------ */

export type SqlEngineVersion =
  | 'POSTGRES_14'
  | 'POSTGRES_16'
  | 'MYSQL_8_0'
  | 'SQLSERVER_2022_STANDARD'
  /** AlloyDB is a PostgreSQL-compatible engine with a different tier model. */
  | 'ALLOYDB';

export interface SqlInstance {
  id: string;
  name: string;
  engine: SqlEngineVersion;
  region: string;
  /** Machine tier, e.g. db-custom-2-7680 or db-perf-optimized-N. */
  tier: string;
  /** Provisioned storage in GiB. */
  storageGb: number;
  /** Storage auto-grow is on by default in GCP. */
  storageAutoResize: boolean;
  vpcId?: string;
  privateIp?: string;
  /** Public IPs only exist when the instance has a public IP enabled. */
  publicIp?: string;
  connectivity: 'PRIVATE' | 'PUBLIC';
  state: 'RUNNABLE' | 'STOPPED' | 'PROVISIONING';
  deletionProtection: boolean;
  automatedBackupEnabled: boolean;
  automatedBackupRetentionDays: number;
  pointInTimeRecoveryEnabled: boolean;
  ipv4Enabled: boolean;
  privateServiceAccess: boolean;
  createdAt: string;
}

export interface SqlDatabase {
  id: string;
  instanceId: string;
  name: string;
  charset?: string;
  collation?: string;
  /** AlloyDB databases belong to a cluster, and can be created online. */
  onlineDdl: boolean;
  createdAt: string;
}

export interface SqlUser {
  id: string;
  instanceId: string;
  name: string;
  type: 'BUILT_IN' | 'CLOUD_IAM_SERVICE_ACCOUNT' | 'ALLOYDB_IAM_PRINCIPAL';
  /** Never stored in plain sight: the console only ever shows a masked hint. */
  passwordHint: string;
  createdAt: string;
}

export interface SqlBackup {
  id: string;
  instanceId: string;
  type: 'AUTOMATED' | 'ON_DEMAND';
  state: 'SUCCESSFUL' | 'FAILED';
  sizeGb: number;
  /** On-demand backups cannot be deleted; automated ones roll off. */
  retained: boolean;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Cloud KMS                                                          */
/* ------------------------------------------------------------------ */

export interface KmsKeyRing {
  id: string;
  name: string;
  /** Key rings are regional, unlike keys in most other services. */
  location: string;
  createdAt: string;
}

export interface KmsKey {
  id: string;
  keyRingId: string;
  name: string;
  purpose: 'ENCRYPT_DECRYPT' | 'ASYMMETRIC_SIGN' | 'MAC';
  algorithm: string;
  state: 'ENABLED' | 'DISABLED' | 'PENDING_DESTRUCTION' | 'DESTROYED';
  protectionLevel: 'SOFTWARE' | 'HSM' | 'EXTERNAL';
  /** Primary version is what encrypt operations use. */
  primaryVersionId?: string;
  rotationPeriodDays: number;
  nextRotationAt?: string;
  /** Set once destroy is requested; the key is unusable after 7 days. */
  destroyScheduledAt?: string;
  createdAt: string;
}

export interface KmsKeyVersion {
  id: string;
  keyId: string;
  /** Versions are monotonic, so learners can see which one encrypts today. */
  state: 'ENABLED' | 'DISABLED' | 'PENDING_DESTRUCTION' | 'DESTROYED';
  algorithm: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Monitoring and alerting                                            */
/* ------------------------------------------------------------------ */

export interface AlertPolicy {
  id: string;
  name: string;
  /** Resource the policy watches, e.g. a cluster id or load balancer id. */
  targetId?: string;
  metric: 'cpu.utilization' | 'memory.utilization' | 'loadBalancer.backendCount' | 'disk.usedFraction' | 'sql.cpu.utilization';
  /** Threshold in percent; the metric is compared against it. */
  threshold: number;
  /** How long the metric must breach before the alert fires. */
  durationSeconds: number;
  severity: 'WARNING' | 'CRITICAL';
  enabled: boolean;
  createdAt: string;
}

export interface UptimeCheck {
  id: string;
  name: string;
  /** Full URL being polled, e.g. http://35.190.0.1/ */
  url: string;
  host: string;
  path: string;
  port: number;
  /** Check interval; GCP's minimum for a custom check is 60 seconds. */
  periodSeconds: number;
  timeoutSeconds: number;
  lastCheckAt?: string;
  /** 0-100 success rate over the retention window. */
  successRate: number;
  latencyMs: number;
  state: 'UP' | 'DOWN' | 'UNKNOWN';
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
  /** Backend service member groups; resolved to VMs for health checks. */
  instanceTemplates: InstanceTemplate[];
  instanceGroups: InstanceGroup[];
  snapshots: DiskSnapshot[];
  nsgs: Nsg[];
  /* Cloud SQL and AlloyDB. Both share the instance/database/user/backup model;
     only the engine and tier naming differ. */
  sqlInstances: SqlInstance[];
  sqlDatabases: SqlDatabase[];
  sqlUsers: SqlUser[];
  sqlBackups: SqlBackup[];
  /* Cloud KMS. Key rings are regional; keys and versions hang off them. */
  kmsKeyRings: KmsKeyRing[];
  kmsKeys: KmsKey[];
  kmsKeyVersions: KmsKeyVersion[];
  /* Cloud Monitoring alerting policies and uptime checks. */
  alertPolicies: AlertPolicy[];
  uptimeChecks: UptimeCheck[];
  /* Kubernetes Engine. All resources are scoped to a cluster, which is itself
     anchored in a VPC so the networking lab can reason about node traffic. */
  k8sClusters: K8sCluster[];
  k8sNamespaces: K8sNamespace[];
  k8sDeployments: K8sDeployment[];
  k8sServices: K8sService[];
  k8sIngresses: K8sIngress[];
  k8sGateways: K8sGateway[];
  k8sConfigMaps: K8sConfigMap[];
  k8sSecrets: K8sSecret[];
  k8sPvcs: K8sPersistentVolumeClaim[];
  k8sAutoscalers: K8sAutoscaler[];
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