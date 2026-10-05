export type CloudRole = 
  | 'roles/owner'
  | 'roles/editor'
  | 'roles/viewer'
  | 'roles/compute.admin'
  | 'roles/storage.admin'
  | 'roles/bigquery.admin'
  | 'roles/iam.serviceAccountUser'
  | 'roles/billing.admin';

export interface Project {
  id: string;
  name: string;
  projectNumber: string;
  projectId: string;
  billingAccountId: string | null;
  createdAt: string;
}

export interface BillingAccount {
  id: string;
  name: string;
  accountNumber: string;
  status: 'OPEN' | 'CLOSED';
  virtualBalance: number;
  totalSpent: number;
  currency: string;
  linkedProjectIds: string[];
}

export interface IamMember {
  id: string;
  projectId: string;
  principal: string;
  type: 'user' | 'serviceAccount' | 'group';
  roles: CloudRole[];
  condition?: string;
  inheritedFrom?: string;
  createdAt: string;
}

export interface ServiceAccount {
  id: string;
  projectId: string;
  name: string;
  displayName: string;
  email: string;
  description: string;
  keysCount: number;
  createdAt: string;
  disabled: boolean;
}

export interface ApiService {
  id: string;
  name: string;
  title: string;
  description: string;
  category: 'Compute' | 'Storage' | 'Databases' | 'Analytics' | 'AI & ML' | 'Management' | 'Networking';
  enabled: boolean;
  documentationUrl: string;
  requiresBilling: boolean;
  pricingNote: string;
}

export interface AuditLogEntry {
  id: string;
  projectId: string;
  timestamp: string;
  principal: string;
  service: string;
  method: string;
  resourceName: string;
  status: 'SUCCESS' | 'DENIED' | 'FAILED';
  details?: string;
}

export interface RecentVisitItem {
  id: string;
  title: string;
  product: string;
  path: string;
  timestamp: string;
}

export interface SubMenuItem {
  title: string;
  path: string;
  badge?: string;
}

export interface MenuGroup {
  groupTitle: string;
  items: SubMenuItem[];
}

export interface NavigationProduct {
  id: string;
  title: string;
  iconName: string;
  path: string;
  hasSubmenu: boolean;
  subgroups?: MenuGroup[];
}

export type StorageClass = 'STANDARD' | 'NEARLINE' | 'COLDLINE' | 'ARCHIVE';
export type LocationType = 'Region' | 'Dual-region' | 'Multi-region';
export type AccessControl = 'UNIFORM' | 'FINE_GRAINED';

export interface LifecycleRule {
  id: string;
  action: 'Delete' | 'SetStorageClass';
  targetStorageClass?: StorageClass;
  conditionAgeDays: number;
  conditionPrefix?: string;
}

export interface BucketIamMember {
  principal: string;
  role: string;
}

export interface Bucket {
  id: string;
  projectId: string;
  name: string;
  location: string;
  locationType: LocationType;
  storageClass: StorageClass;
  accessControl: AccessControl;
  publicAccessPrevention: boolean;
  isPublic: boolean;
  versioning: boolean;
  encryption: string;
  retentionDays?: number;
  createdAt: string;
  updatedAt: string;
  lifecycleRules: LifecycleRule[];
  iamMembers: BucketIamMember[];
}

export interface StorageObject {
  id: string;
  bucketId: string;
  bucketName: string;
  name: string; // e.g. "assets/style.css" or "index.html"
  contentType: string;
  size: number;
  storageClass: StorageClass;
  updatedAt: string;
  contentData?: string; // Base64 or plain text data for download
  md5Hash: string;
}

// ==========================================
// PHASE 3: Compute Engine & VPC Types
// ==========================================

export type VmStatus =
  | 'PROVISIONING'
  | 'STAGING'
  | 'RUNNING'
  | 'STOPPING'
  | 'TERMINATED'
  | 'REPAIRING';

export type MachineFamily = 'GENERAL_PURPOSE' | 'COMPUTE_OPTIMIZED' | 'MEMORY_OPTIMIZED';
export type DiskType = 'pd-standard' | 'pd-balanced' | 'pd-ssd';

export interface VmInstance {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  zone: string; // e.g. us-central1-a
  machineType: string; // e.g. e2-micro
  cpuCount: number;
  memoryGb: number;
  status: VmStatus;
  internalIp: string;
  externalIp?: string;
  osImage: string; // e.g. Debian GNU/Linux 12 (bookworm)
  bootDiskSizeGb: number;
  bootDiskType: DiskType;
  allowHttp: boolean;
  allowHttps: boolean;
  networkTags: string[];
  serviceAccountEmail?: string;
  networkName: string;
  subnetName: string;
  createdAt: string;
  updatedAt: string;
  dockerContainerId?: string;
}

export interface VpcNetwork {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  subnetCount: number;
  mtu: number;
  createdAt: string;
}

export interface VpcSubnet {
  id: string;
  networkId: string;
  networkName: string;
  name: string;
  region: string;
  ipCidrRange: string;
}

export interface VpcFirewallRule {
  id: string;
  projectId: string;
  networkName: string;
  name: string;
  direction: 'INGRESS' | 'EGRESS';
  priority: number;
  action: 'ALLOW' | 'DENY';
  targets: string;
  sourceRanges: string;
  protocolsAndPorts: string;
  description?: string;
  disabled?: boolean;
}

// ==========================================
// PHASE 5: Pub/Sub & Cloud Run Types
// ==========================================

export interface PubSubTopic {
  id: string;
  projectId: string;
  name: string;
  retentionDays: number;
  messageCount: number;
  createdAt: string;
}

export interface PubSubMessage {
  id: string;
  topicName: string;
  data: string;
  attributes: Record<string, string>;
  publishTime: string;
  orderingKey?: string;
  deliveryAttempts: number;
}

export interface PubSubSubscription {
  id: string;
  projectId: string;
  name: string;
  topicName: string;
  deliveryType: 'PULL' | 'PUSH';
  pushEndpoint?: string;
  ackDeadlineSeconds: number;
  retainAckedMessages: boolean;
  retentionDays: number;
  deadLetterTopic?: string;
  maxDeliveryAttempts: number;
  createdAt: string;
}

export interface PulledMessage {
  ackId: string;
  message: PubSubMessage;
  deliveryAttempt: number;
}

export interface CloudRunRevision {
  id: string;
  serviceId: string;
  name: string;
  image: string;
  sourceType: 'IMAGE' | 'NODE' | 'PYTHON';
  sourceCode?: string;
  trafficPercent: number;
  cpu: string; // e.g. "1" or "2"
  memory: string; // e.g. "512Mi" or "1Gi"
  minInstances: number;
  maxInstances: number;
  createdAt: string;
}

export interface CloudRunLog {
  id: string;
  serviceId: string;
  revisionName: string;
  timestamp: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  textPayload: string;
  httpStatus?: number;
  latencyMs?: number;
}

export interface CloudRunService {
  id: string;
  projectId: string;
  name: string;
  region: string;
  url: string;
  latestRevisionName: string;
  revisions: CloudRunRevision[];
  allowUnauthenticated: boolean;
  status: 'READY' | 'DEPLOYING' | 'FAILED';
  envVars: Record<string, string>;
  activeInstances: number;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// PHASE 6: Observability, Secrets, BigQuery
// ==========================================

export interface SecretVersion {
  version: string;
  state: 'ENABLED' | 'DESTROYED';
  createdAt: string;
  payload: string;
}

export interface Secret {
  id: string;
  projectId: string;
  name: string;
  replication: 'AUTOMATIC' | 'USER_MANAGED';
  labels: Record<string, string>;
  createdAt: string;
  versions: SecretVersion[];
}

export interface BigQueryColumn {
  name: string;
  type: 'STRING' | 'INTEGER' | 'FLOAT' | 'BOOLEAN' | 'TIMESTAMP';
  mode?: 'NULLABLE' | 'REQUIRED';
}

export interface BigQueryTable {
  id: string;
  name: string;
  datasetId: string;
  rowCount: number;
  sizeBytes: number;
  columns: BigQueryColumn[];
  rows: Record<string, any>[];
  createdAt: string;
}

export interface BigQueryDataset {
  id: string;
  projectId: string;
  name: string;
  location: string;
  tables: BigQueryTable[];
  createdAt: string;
}

export interface BigQueryQueryResult {
  columns: string[];
  rows: any[][];
  totalRows: number;
  bytesProcessed: number;
  executionTimeMs: number;
  query: string;
  executedAt: string;
}



