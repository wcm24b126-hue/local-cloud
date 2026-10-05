import React, { createContext, useContext, useState, useEffect } from 'react';
import { NETLAB_HELP_LINES } from '../sim/cli';
import {
  Project,
  BillingAccount,
  IamMember,
  ServiceAccount,
  ApiService,
  AuditLogEntry,
  RecentVisitItem,
  CloudRole,
  Bucket,
  StorageObject,
  LifecycleRule,
  BucketIamMember,
  VmInstance,
  VmStatus,
  VpcNetwork,
  VpcSubnet,
  VpcFirewallRule,
  PubSubTopic,
  PubSubSubscription,
  PubSubMessage,
  PulledMessage,
  CloudRunService,
  CloudRunRevision,
  CloudRunLog,
  Secret,
  SecretVersion,
  BigQueryDataset,
  BigQueryTable,
  BigQueryColumn,
  BigQueryQueryResult,
} from '../types';

interface LocalCloudContextType {
  // Projects
  currentProject: Project;
  projects: Project[];
  setCurrentProject: (project: Project) => void;
  createProject: (name: string, projectId?: string) => Project;

  // Billing
  billingAccount: BillingAccount;
  isBillingEnabledForCurrentProject: boolean;
  linkProjectBilling: (projectId: string, enable: boolean) => void;
  updateVirtualBalance: (amount: number) => void;

  // IAM
  members: IamMember[];
  addMember: (principal: string, roles: CloudRole[], type?: 'user' | 'serviceAccount' | 'group') => void;
  updateMemberRoles: (id: string, roles: CloudRole[]) => void;
  removeMember: (id: string) => void;

  // Service Accounts
  serviceAccounts: ServiceAccount[];
  createServiceAccount: (name: string, displayName: string, description: string) => ServiceAccount;
  deleteServiceAccount: (id: string) => void;

  // APIs & Services
  apiServices: ApiService[];
  toggleApi: (apiId: string, enabled: boolean) => void;
  isApiEnabled: (apiId: string) => boolean;

  // Cloud Storage
  buckets: Bucket[];
  objects: StorageObject[];
  selectedBucket: Bucket | null;
  setSelectedBucket: (bucket: Bucket | null) => void;
  currentFolderPrefix: string;
  setCurrentFolderPrefix: (prefix: string) => void;
  createBucket: (data: Partial<Bucket>) => Bucket;
  deleteBucket: (bucketId: string) => void;
  updateBucket: (bucketId: string, updates: Partial<Bucket>) => void;
  uploadObject: (bucketName: string, name: string, fileData: { name: string; size: number; type: string; content?: string }) => StorageObject;
  deleteObject: (objectId: string) => void;
  addLifecycleRule: (bucketId: string, rule: Omit<LifecycleRule, 'id'>) => void;
  deleteLifecycleRule: (bucketId: string, ruleId: string) => void;
  addBucketIamMember: (bucketId: string, principal: string, role: string) => void;
  removeBucketIamMember: (bucketId: string, principal: string) => void;

  // Compute Engine
  vmInstances: VmInstance[];
  selectedVm: VmInstance | null;
  setSelectedVm: (vm: VmInstance | null) => void;
  createVmInstance: (data: Partial<VmInstance>) => VmInstance;
  startVmInstance: (id: string) => void;
  stopVmInstance: (id: string) => void;
  resetVmInstance: (id: string) => void;
  deleteVmInstance: (id: string) => void;
  connectSshToVm: (vm: VmInstance) => void;

  // VPC Network
  vpcNetworks: VpcNetwork[];
  vpcSubnets: VpcSubnet[];
  firewallRules: VpcFirewallRule[];
  createFirewallRule: (rule: Partial<VpcFirewallRule>) => VpcFirewallRule;
  deleteFirewallRule: (id: string) => void;

  // Docker backend feature flag
  isDockerBackendEnabled: boolean;
  setIsDockerBackendEnabled: (enabled: boolean) => void;

  // Phase 5: Pub/Sub
  pubsubTopics: PubSubTopic[];
  pubsubSubscriptions: PubSubSubscription[];
  pubsubMessages: PubSubMessage[];
  deadLetterMessages: PubSubMessage[];
  selectedTopic: PubSubTopic | null;
  setSelectedTopic: (topic: PubSubTopic | null) => void;
  selectedSubscription: PubSubSubscription | null;
  setSelectedSubscription: (sub: PubSubSubscription | null) => void;
  createPubsubTopic: (name: string, retentionDays?: number) => PubSubTopic;
  deletePubsubTopic: (id: string) => void;
  createPubsubSubscription: (data: Partial<PubSubSubscription>) => PubSubSubscription;
  deletePubsubSubscription: (id: string) => void;
  publishPubsubMessage: (topicName: string, data: string, attributes?: Record<string, string>, orderingKey?: string) => PubSubMessage;
  pullPubsubMessages: (subscriptionName: string, maxMessages?: number) => PulledMessage[];
  ackPubsubMessage: (subscriptionName: string, ackId: string) => void;
  nackPubsubMessage: (subscriptionName: string, ackId: string) => void;

  // Phase 5: Cloud Run
  runServices: CloudRunService[];
  runLogs: CloudRunLog[];
  selectedRunService: CloudRunService | null;
  setSelectedRunService: (service: CloudRunService | null) => void;
  deployRunService: (data: Partial<CloudRunService> & { initialRevision?: Partial<CloudRunRevision> }) => CloudRunService;
  deleteRunService: (serviceId: string) => void;
  invokeRunService: (serviceId: string, path: string, method?: string, headers?: Record<string, string>, body?: string) => Promise<{ status: number; data: any; headers: Record<string, string>; latencyMs: number }>;

  // Phase 6: Secret Manager
  secrets: Secret[];
  selectedSecret: Secret | null;
  setSelectedSecret: (secret: Secret | null) => void;
  createSecret: (name: string, payload: string, labels?: Record<string, string>) => Secret;
  deleteSecret: (secretId: string) => void;
  addSecretVersion: (secretId: string, payload: string) => SecretVersion;
  destroySecretVersion: (secretId: string, version: string) => void;

  // Phase 6: BigQuery-lite
  bqDatasets: BigQueryDataset[];
  selectedBqDataset: BigQueryDataset | null;
  setSelectedBqDataset: (ds: BigQueryDataset | null) => void;
  selectedBqTable: BigQueryTable | null;
  setSelectedBqTable: (table: BigQueryTable | null) => void;
  bqQueryHistory: BigQueryQueryResult[];
  executeBigQuery: (sql: string) => BigQueryQueryResult;

  // Navigation & Shell
  activeView: string;
  setActiveView: (view: string, itemTitle?: string, productName?: string) => void;
  recentVisits: RecentVisitItem[];
  favourites: string[];
  toggleFavourite: (productId: string) => void;
  isFavourite: (productId: string) => boolean;

  // Drawers
  isNavDrawerOpen: boolean;
  setIsNavDrawerOpen: (open: boolean) => void;
  isCloudShellOpen: boolean;
  setIsCloudShellOpen: (open: boolean) => void;
  isAssistantOpen: boolean;
  setIsAssistantOpen: (open: boolean) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  isProjectPickerOpen: boolean;
  setIsProjectPickerOpen: (open: boolean) => void;

  // Theme
  isDarkMode: boolean;
  toggleTheme: () => void;

  // Audit Logs
  auditLogs: AuditLogEntry[];
  logAuditAction: (service: string, method: string, resourceName: string, status?: 'SUCCESS' | 'DENIED' | 'FAILED', details?: string) => void;

  // Cloud Shell Command Runner
  executeCliCommand: (command: string) => string[];

  // Toast
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const INITIAL_PROJECT: Project = {
  id: 'proj-460008',
  name: 'My First Project',
  projectNumber: '460008',
  projectId: 'optical-order-460008-i6',
  billingAccountId: 'billing-001',
  createdAt: '2026-09-15T10:00:00Z',
};

const INITIAL_BILLING: BillingAccount = {
  id: 'billing-001',
  name: 'My Billing Account',
  accountNumber: '01D5B2-99F4A1-7788C3',
  status: 'OPEN',
  virtualBalance: 300.0,
  totalSpent: 0.0,
  currency: 'USD',
  linkedProjectIds: ['proj-460008'],
};

const INITIAL_APIS: ApiService[] = [
  {
    id: 'compute.googleapis.com',
    name: 'compute.googleapis.com',
    title: 'Compute Engine API',
    description: 'Creates and runs virtual machines on Google infrastructure.',
    category: 'Compute',
    enabled: true,
    documentationUrl: 'https://cloud.google.com/compute/docs',
    requiresBilling: true,
    pricingNote: 'Free tier eligible on e2-micro',
  },
  {
    id: 'storage.googleapis.com',
    name: 'storage.googleapis.com',
    title: 'Cloud Storage API',
    description: 'Stores and retrieves data at any time, from anywhere on the web.',
    category: 'Storage',
    enabled: true,
    documentationUrl: 'https://cloud.google.com/storage/docs',
    requiresBilling: false,
    pricingNote: '5 GB-months free tier',
  },
  {
    id: 'iam.googleapis.com',
    name: 'iam.googleapis.com',
    title: 'Identity and Access Management (IAM) API',
    description: 'Manages identity and access control for Google Cloud resources.',
    category: 'Management',
    enabled: true,
    documentationUrl: 'https://cloud.google.com/iam/docs',
    requiresBilling: false,
    pricingNote: 'Always Free',
  },
  {
    id: 'bigquery.googleapis.com',
    name: 'bigquery.googleapis.com',
    title: 'BigQuery API',
    description: 'A data platform for customers to manage and analyze data.',
    category: 'Analytics',
    enabled: true,
    documentationUrl: 'https://cloud.google.com/bigquery/docs',
    requiresBilling: false,
    pricingNote: '1 TB/month queries free',
  },
  {
    id: 'run.googleapis.com',
    name: 'run.googleapis.com',
    title: 'Cloud Run Admin API',
    description: 'Deploys and manages user-provided container images in a serverless environment.',
    category: 'Compute',
    enabled: false,
    documentationUrl: 'https://cloud.google.com/run/docs',
    requiresBilling: true,
    pricingNote: '2 million requests/month free',
  },
  {
    id: 'sqladmin.googleapis.com',
    name: 'sqladmin.googleapis.com',
    title: 'Cloud SQL Admin API',
    description: 'API for Cloud SQL database instance management.',
    category: 'Databases',
    enabled: false,
    documentationUrl: 'https://cloud.google.com/sql/docs',
    requiresBilling: true,
    pricingNote: 'Requires billing account',
  },
  {
    id: 'pubsub.googleapis.com',
    name: 'pubsub.googleapis.com',
    title: 'Cloud Pub/Sub API',
    description: 'Provides reliable, many-to-many, asynchronous messaging between applications.',
    category: 'Analytics',
    enabled: false,
    documentationUrl: 'https://cloud.google.com/pubsub/docs',
    requiresBilling: false,
    pricingNote: '10 GB free per month',
  },
  {
    id: 'secretmanager.googleapis.com',
    name: 'secretmanager.googleapis.com',
    title: 'Secret Manager API',
    description: 'Stores sensitive data such as API keys, passwords, and certificates.',
    category: 'Management',
    enabled: false,
    documentationUrl: 'https://cloud.google.com/secret-manager/docs',
    requiresBilling: false,
    pricingNote: '6 active secret versions free',
  },
  {
    id: 'logging.googleapis.com',
    name: 'logging.googleapis.com',
    title: 'Cloud Logging API',
    description: 'Writes log entries and manages your Cloud Logging configuration.',
    category: 'Management',
    enabled: true,
    documentationUrl: 'https://cloud.google.com/logging/docs',
    requiresBilling: false,
    pricingNote: '50 GiB/month free',
  }
];

const INITIAL_MEMBERS: IamMember[] = [
  {
    id: 'mem-001',
    projectId: 'proj-460008',
    principal: 'student@localcloud.dev',
    type: 'user',
    roles: ['roles/owner'],
    createdAt: '2026-09-15T10:00:00Z',
  },
  {
    id: 'mem-002',
    projectId: 'proj-460008',
    principal: '460008-compute@developer.gserviceaccount.com',
    type: 'serviceAccount',
    roles: ['roles/editor'],
    createdAt: '2026-09-15T10:00:00Z',
  },
  {
    id: 'mem-003',
    projectId: 'proj-460008',
    principal: 'service-460008@compute-system.iam.gserviceaccount.com',
    type: 'serviceAccount',
    roles: ['roles/compute.admin'],
    inheritedFrom: 'Google APIs Service Agent',
    createdAt: '2026-09-15T10:00:00Z',
  }
];

const INITIAL_SERVICE_ACCOUNTS: ServiceAccount[] = [
  {
    id: 'sa-001',
    projectId: 'proj-460008',
    name: 'default-compute-sa',
    displayName: 'Compute Engine default service account',
    email: '460008-compute@developer.gserviceaccount.com',
    description: 'Default service account used by Compute Engine instances in this project',
    keysCount: 1,
    createdAt: '2026-09-15T10:00:00Z',
    disabled: false,
  },
  {
    id: 'sa-002',
    projectId: 'proj-460008',
    name: 'cloud-storage-app',
    displayName: 'Cloud Storage Uploader',
    email: 'cloud-storage-app@optical-order-460008-i6.iam.gserviceaccount.com',
    description: 'Used by backend microservices to upload media to Cloud Storage buckets',
    keysCount: 0,
    createdAt: '2026-09-20T14:32:00Z',
    disabled: false,
  }
];

const INITIAL_BUCKETS: Bucket[] = [
  {
    id: 'b-001',
    projectId: 'proj-460008',
    name: 'optical-order-460008-i6-assets',
    location: 'us-central1',
    locationType: 'Region',
    storageClass: 'STANDARD',
    accessControl: 'UNIFORM',
    publicAccessPrevention: false,
    isPublic: true,
    versioning: false,
    encryption: 'Google-managed',
    createdAt: '2026-09-16T12:00:00Z',
    updatedAt: '2026-09-16T12:00:00Z',
    lifecycleRules: [
      {
        id: 'lr-1',
        action: 'Delete',
        conditionAgeDays: 365,
      }
    ],
    iamMembers: [
      { principal: 'allUsers', role: 'roles/storage.objectViewer' },
      { principal: 'student@localcloud.dev', role: 'roles/storage.admin' }
    ]
  },
  {
    id: 'b-002',
    projectId: 'proj-460008',
    name: 'cloud-training-datasets',
    location: 'us-central1',
    locationType: 'Region',
    storageClass: 'STANDARD',
    accessControl: 'UNIFORM',
    publicAccessPrevention: true,
    isPublic: false,
    versioning: true,
    encryption: 'Google-managed',
    createdAt: '2026-09-18T08:30:00Z',
    updatedAt: '2026-09-18T08:30:00Z',
    lifecycleRules: [
      {
        id: 'lr-2',
        action: 'SetStorageClass',
        targetStorageClass: 'COLDLINE',
        conditionAgeDays: 90,
      }
    ],
    iamMembers: [
      { principal: 'student@localcloud.dev', role: 'roles/storage.admin' }
    ]
  }
];

const INITIAL_OBJECTS: StorageObject[] = [
  {
    id: 'obj-1',
    bucketId: 'b-001',
    bucketName: 'optical-order-460008-i6-assets',
    name: 'index.html',
    contentType: 'text/html',
    size: 1420,
    storageClass: 'STANDARD',
    updatedAt: '2026-09-16T12:05:00Z',
    contentData: '<!DOCTYPE html>\n<html>\n  <head><title>LocalCloud Static Website</title></head>\n  <body style="font-family: sans-serif; padding: 2rem;">\n    <h1>Welcome to Google Cloud Storage on LocalCloud</h1>\n    <p>This static website is served directly from an emulated GCS bucket!</p>\n  </body>\n</html>',
    md5Hash: 'c4ca4238a0b923820dcc509a6f75849b'
  },
  {
    id: 'obj-2',
    bucketId: 'b-001',
    bucketName: 'optical-order-460008-i6-assets',
    name: 'styles/main.css',
    contentType: 'text/css',
    size: 640,
    storageClass: 'STANDARD',
    updatedAt: '2026-09-16T12:08:00Z',
    contentData: 'body {\n  margin: 0;\n  background-color: #0e0e0f;\n  color: #e8eaed;\n  font-family: -apple-system, sans-serif;\n}',
    md5Hash: 'c81e728d9d4c2f636f067f89cc14862c'
  },
  {
    id: 'obj-3',
    bucketId: 'b-001',
    bucketName: 'optical-order-460008-i6-assets',
    name: 'images/hero.png',
    contentType: 'image/png',
    size: 24500,
    storageClass: 'STANDARD',
    updatedAt: '2026-09-16T12:12:00Z',
    contentData: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEeQHzH+Z7uAAAAABJRU5ErkJggg==',
    md5Hash: 'eccbc87e4b5ce2fe28308fd9f2a7baf3'
  },
  {
    id: 'obj-4',
    bucketId: 'b-002',
    bucketName: 'cloud-training-datasets',
    name: 'ml/train_data_v1.csv',
    contentType: 'text/csv',
    size: 12400,
    storageClass: 'STANDARD',
    updatedAt: '2026-09-18T09:00:00Z',
    contentData: 'id,feature_1,feature_2,feature_3,label\n1,0.25,1.4,12.5,1\n2,0.88,0.3,9.8,0\n3,0.12,0.9,15.2,1\n4,0.45,2.1,11.0,1\n5,0.72,0.4,8.1,0',
    md5Hash: 'a87ff679a2f3e71d9181a67b7542122c'
  },
  {
    id: 'obj-5',
    bucketId: 'b-002',
    bucketName: 'cloud-training-datasets',
    name: 'ml/eval_metrics.json',
    contentType: 'application/json',
    size: 420,
    storageClass: 'STANDARD',
    updatedAt: '2026-09-18T09:15:00Z',
    contentData: '{\n  "model_version": "v1.0.4",\n  "accuracy": 0.942,\n  "loss": 0.088,\n  "epochs": 50,\n  "timestamp": "2026-09-18T09:15:00Z"\n}',
    md5Hash: 'e4da3b7fbbce2345d7772b0674a318d5'
  }
];

const INITIAL_VMS: VmInstance[] = [
  {
    id: 'vm-001',
    projectId: 'proj-460008',
    name: 'local-dev-vm-1',
    description: 'Primary general purpose web and development server',
    zone: 'us-central1-a',
    machineType: 'e2-micro',
    cpuCount: 2,
    memoryGb: 1,
    status: 'RUNNING',
    internalIp: '10.128.0.2',
    externalIp: '34.68.102.1',
    osImage: 'Debian GNU/Linux 12 (bookworm)',
    bootDiskSizeGb: 10,
    bootDiskType: 'pd-standard',
    allowHttp: true,
    allowHttps: true,
    networkTags: ['http-server', 'https-server'],
    serviceAccountEmail: '460008-compute@developer.gserviceaccount.com',
    networkName: 'default',
    subnetName: 'default-us-central1',
    createdAt: '2026-09-20T10:00:00Z',
    updatedAt: '2026-09-20T10:00:00Z',
  }
];

const INITIAL_VPC_NETWORKS: VpcNetwork[] = [
  {
    id: 'net-default',
    projectId: 'proj-460008',
    name: 'default',
    description: 'Default auto-mode network for project',
    subnetCount: 4,
    mtu: 1460,
    createdAt: '2026-09-15T10:00:00Z',
  }
];

const INITIAL_VPC_SUBNETS: VpcSubnet[] = [
  {
    id: 'sub-1',
    networkId: 'net-default',
    networkName: 'default',
    name: 'default-us-central1',
    region: 'us-central1',
    ipCidrRange: '10.128.0.0/20',
  },
  {
    id: 'sub-2',
    networkId: 'net-default',
    networkName: 'default',
    name: 'default-us-east1',
    region: 'us-east1',
    ipCidrRange: '10.142.0.0/20',
  },
  {
    id: 'sub-3',
    networkId: 'net-default',
    networkName: 'default',
    name: 'default-europe-west1',
    region: 'europe-west1',
    ipCidrRange: '10.132.0.0/20',
  },
  {
    id: 'sub-4',
    networkId: 'net-default',
    networkName: 'default',
    name: 'default-asia-east1',
    region: 'asia-east1',
    ipCidrRange: '10.140.0.0/20',
  }
];

const INITIAL_FIREWALL_RULES: VpcFirewallRule[] = [
  {
    id: 'fw-1',
    projectId: 'proj-460008',
    networkName: 'default',
    name: 'default-allow-icmp',
    direction: 'INGRESS',
    priority: 65534,
    action: 'ALLOW',
    targets: 'Apply to all',
    sourceRanges: '0.0.0.0/0',
    protocolsAndPorts: 'icmp',
    description: 'Allow ICMP from anywhere',
  },
  {
    id: 'fw-2',
    projectId: 'proj-460008',
    networkName: 'default',
    name: 'default-allow-internal',
    direction: 'INGRESS',
    priority: 65534,
    action: 'ALLOW',
    targets: 'Apply to all',
    sourceRanges: '10.128.0.0/9',
    protocolsAndPorts: 'tcp:0-65535, udp:0-65535, icmp',
    description: 'Allow internal traffic on the default network',
  },
  {
    id: 'fw-3',
    projectId: 'proj-460008',
    networkName: 'default',
    name: 'default-allow-ssh',
    direction: 'INGRESS',
    priority: 65534,
    action: 'ALLOW',
    targets: 'Apply to all',
    sourceRanges: '0.0.0.0/0',
    protocolsAndPorts: 'tcp:22',
    description: 'Allow SSH from anywhere',
  },
  {
    id: 'fw-4',
    projectId: 'proj-460008',
    networkName: 'default',
    name: 'default-allow-http',
    direction: 'INGRESS',
    priority: 1000,
    action: 'ALLOW',
    targets: 'http-server tag',
    sourceRanges: '0.0.0.0/0',
    protocolsAndPorts: 'tcp:80',
    description: 'Allow HTTP traffic for tagged instances',
  },
  {
    id: 'fw-5',
    projectId: 'proj-460008',
    networkName: 'default',
    name: 'default-allow-https',
    direction: 'INGRESS',
    priority: 1000,
    action: 'ALLOW',
    targets: 'https-server tag',
    sourceRanges: '0.0.0.0/0',
    protocolsAndPorts: 'tcp:443',
    description: 'Allow HTTPS traffic for tagged instances',
  }
];

const INITIAL_PUBSUB_TOPICS: PubSubTopic[] = [
  {
    id: 'top-1',
    projectId: 'proj-460008',
    name: 'order-events',
    retentionDays: 7,
    messageCount: 2,
    createdAt: '2026-09-22T10:00:00Z',
  },
  {
    id: 'top-2',
    projectId: 'proj-460008',
    name: 'order-dead-letter',
    retentionDays: 14,
    messageCount: 0,
    createdAt: '2026-09-22T10:15:00Z',
  },
];

const INITIAL_PUBSUB_SUBSCRIPTIONS: PubSubSubscription[] = [
  {
    id: 'sub-1',
    projectId: 'proj-460008',
    name: 'order-processing-sub',
    topicName: 'order-events',
    deliveryType: 'PULL',
    ackDeadlineSeconds: 10,
    retainAckedMessages: false,
    retentionDays: 7,
    deadLetterTopic: 'order-dead-letter',
    maxDeliveryAttempts: 5,
    createdAt: '2026-09-22T10:05:00Z',
  },
  {
    id: 'sub-2',
    projectId: 'proj-460008',
    name: 'order-analytics-sub',
    topicName: 'order-events',
    deliveryType: 'PULL',
    ackDeadlineSeconds: 30,
    retainAckedMessages: false,
    retentionDays: 7,
    maxDeliveryAttempts: 5,
    createdAt: '2026-09-22T10:10:00Z',
  },
];

const INITIAL_PUBSUB_MESSAGES: PubSubMessage[] = [
  {
    id: 'msg-101',
    topicName: 'order-events',
    data: JSON.stringify(
      { orderId: 'ORD-9421', amount: 89.5, customer: 'alex@example.com', items: ['Cloud Handbook', 'Coffee Mug'] },
      null,
      2
    ),
    attributes: { region: 'us-central1', priority: 'high', environment: 'production' },
    publishTime: '2026-09-22T11:00:00Z',
    deliveryAttempts: 1,
  },
  {
    id: 'msg-102',
    topicName: 'order-events',
    data: JSON.stringify(
      { orderId: 'ORD-9422', amount: 19.99, customer: 'jordan@example.com', items: ['Sticker Pack'] },
      null,
      2
    ),
    attributes: { region: 'europe-west1', priority: 'normal', environment: 'production' },
    publishTime: '2026-09-22T11:05:00Z',
    deliveryAttempts: 1,
  },
];

const INITIAL_RUN_SERVICES: CloudRunService[] = [
  {
    id: 'run-001',
    projectId: 'proj-460008',
    name: 'hello-service',
    region: 'us-central1',
    url: 'https://hello-service-460008-uc.a.run.app',
    latestRevisionName: 'hello-service-00001-v1',
    allowUnauthenticated: true,
    status: 'READY',
    envVars: { NODE_ENV: 'production', PORT: '8080' },
    activeInstances: 1,
    createdAt: '2026-09-24T12:00:00Z',
    updatedAt: '2026-09-24T12:00:00Z',
    revisions: [
      {
        id: 'rev-001',
        serviceId: 'run-001',
        name: 'hello-service-00001-v1',
        image: 'gcr.io/google-samples/hello-app:1.0',
        sourceType: 'NODE',
        sourceCode: `// LocalCloud Express Microservice
import express from 'express';
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Hello from Google Cloud Run on LocalCloud!',
    region: 'us-central1',
    timestamp: new Date().toISOString()
  });
});

app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

app.post('/echo', (req, res) => {
  res.json({
    receivedData: req.body,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
});`,
        trafficPercent: 100,
        cpu: '1',
        memory: '512Mi',
        minInstances: 0,
        maxInstances: 10,
        createdAt: '2026-09-24T12:00:00Z',
      },
    ],
  },
];

const INITIAL_RUN_LOGS: CloudRunLog[] = [
  {
    id: 'log-1',
    serviceId: 'run-001',
    revisionName: 'hello-service-00001-v1',
    timestamp: '2026-09-24T12:00:01Z',
    severity: 'INFO',
    textPayload: 'Container container-0 started and listening on 0.0.0.0:8080',
  },
  {
    id: 'log-2',
    serviceId: 'run-001',
    revisionName: 'hello-service-00001-v1',
    timestamp: '2026-09-24T12:05:22Z',
    severity: 'INFO',
    textPayload: 'GET 200 12ms /',
    httpStatus: 200,
    latencyMs: 12,
  },
];

const INITIAL_SECRETS: Secret[] = [
  {
    id: 'sec-1',
    projectId: 'proj-460008',
    name: 'database-credentials',
    replication: 'AUTOMATIC',
    labels: { env: 'production', tier: 'backend' },
    createdAt: '2026-09-20T10:00:00Z',
    versions: [
      {
        version: '1',
        state: 'ENABLED',
        createdAt: '2026-09-20T10:00:00Z',
        payload: 'postgres://admin:LocalCloudP@ss99@10.128.0.5:5432/app_db',
      },
    ],
  },
  {
    id: 'sec-2',
    projectId: 'proj-460008',
    name: 'stripe-api-key',
    replication: 'AUTOMATIC',
    labels: { env: 'production', service: 'billing' },
    createdAt: '2026-09-21T14:30:00Z',
    versions: [
      {
        version: '1',
        state: 'ENABLED',
        createdAt: '2026-09-21T14:30:00Z',
        payload: 'placeholder-stripe-key-not-a-real-secret',
      },
    ],
  },
  {
    id: 'sec-3',
    projectId: 'proj-460008',
    name: 'auth-jwt-secret',
    replication: 'AUTOMATIC',
    labels: { env: 'production', service: 'auth' },
    createdAt: '2026-09-22T08:15:00Z',
    versions: [
      {
        version: '1',
        state: 'ENABLED',
        createdAt: '2026-09-22T08:15:00Z',
        payload: 'localcloud-super-secure-jwt-signing-key-32b',
      },
    ],
  },
];

const INITIAL_BQ_DATASETS: BigQueryDataset[] = [
  {
    id: 'ds-1',
    projectId: 'proj-460008',
    name: 'billing_export',
    location: 'US',
    createdAt: '2026-09-20T12:00:00Z',
    tables: [
      {
        id: 'tbl-1',
        name: 'gcp_billing_export_v1',
        datasetId: 'ds-1',
        rowCount: 6,
        sizeBytes: 1540,
        createdAt: '2026-09-20T12:00:00Z',
        columns: [
          { name: 'usage_date', type: 'STRING', mode: 'REQUIRED' },
          { name: 'service_description', type: 'STRING', mode: 'REQUIRED' },
          { name: 'sku_id', type: 'STRING', mode: 'NULLABLE' },
          { name: 'cost', type: 'FLOAT', mode: 'REQUIRED' },
          { name: 'currency', type: 'STRING', mode: 'REQUIRED' },
        ],
        rows: [
          { usage_date: '2026-10-01', service_description: 'Compute Engine', sku_id: 'E2-Instance-Core', cost: 14.28, currency: 'USD' },
          { usage_date: '2026-10-01', service_description: 'Cloud Storage', sku_id: 'Storage-Standard-US', cost: 2.45, currency: 'USD' },
          { usage_date: '2026-10-02', service_description: 'Cloud Run', sku_id: 'Run-CPU-Allocation', cost: 0.85, currency: 'USD' },
          { usage_date: '2026-10-03', service_description: 'Pub/Sub', sku_id: 'Pubsub-Message-Delivery', cost: 0.12, currency: 'USD' },
          { usage_date: '2026-10-04', service_description: 'Compute Engine', sku_id: 'E2-Instance-RAM', cost: 8.70, currency: 'USD' },
          { usage_date: '2026-10-04', service_description: 'Cloud SQL', sku_id: 'SQL-Instance-Micro', cost: 11.20, currency: 'USD' },
        ],
      },
    ],
  },
  {
    id: 'ds-2',
    projectId: 'proj-460008',
    name: 'app_telemetry',
    location: 'US',
    createdAt: '2026-09-21T09:00:00Z',
    tables: [
      {
        id: 'tbl-2',
        name: 'daily_traffic',
        datasetId: 'ds-2',
        rowCount: 5,
        sizeBytes: 1280,
        createdAt: '2026-09-21T09:00:00Z',
        columns: [
          { name: 'date', type: 'STRING', mode: 'REQUIRED' },
          { name: 'path', type: 'STRING', mode: 'REQUIRED' },
          { name: 'status_code', type: 'INTEGER', mode: 'REQUIRED' },
          { name: 'requests', type: 'INTEGER', mode: 'REQUIRED' },
          { name: 'latency_ms', type: 'INTEGER', mode: 'NULLABLE' },
        ],
        rows: [
          { date: '2026-10-04', path: '/', status_code: 200, requests: 14200, latency_ms: 18 },
          { date: '2026-10-04', path: '/api/v1/orders', status_code: 200, requests: 4890, latency_ms: 45 },
          { date: '2026-10-04', path: '/api/v1/checkout', status_code: 201, requests: 920, latency_ms: 82 },
          { date: '2026-10-04', path: '/login', status_code: 401, requests: 88, latency_ms: 22 },
          { date: '2026-10-04', path: '/healthz', status_code: 200, requests: 52000, latency_ms: 2 },
        ],
      },
    ],
  },
];

const LocalCloudContext = createContext<LocalCloudContextType | null>(null);

export const LocalCloudProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Theme
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('localcloud_theme');
    return saved !== 'light';
  });

  // Projects
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('localcloud_projects');
    return saved ? JSON.parse(saved) : [INITIAL_PROJECT];
  });
  const [currentProject, setCurrentProject] = useState<Project>(() => projects[0] || INITIAL_PROJECT);

  // Billing
  const [billingAccount, setBillingAccount] = useState<BillingAccount>(() => {
    const saved = localStorage.getItem('localcloud_billing');
    return saved ? JSON.parse(saved) : INITIAL_BILLING;
  });

  // IAM
  const [members, setMembers] = useState<IamMember[]>(() => {
    const saved = localStorage.getItem('localcloud_members');
    return saved ? JSON.parse(saved) : INITIAL_MEMBERS;
  });

  // Service Accounts
  const [serviceAccounts, setServiceAccounts] = useState<ServiceAccount[]>(() => {
    const saved = localStorage.getItem('localcloud_service_accounts');
    return saved ? JSON.parse(saved) : INITIAL_SERVICE_ACCOUNTS;
  });

  // APIs
  const [apiServices, setApiServices] = useState<ApiService[]>(() => {
    const saved = localStorage.getItem('localcloud_apis');
    return saved ? JSON.parse(saved) : INITIAL_APIS;
  });

  // Cloud Storage
  const [buckets, setBuckets] = useState<Bucket[]>(() => {
    const saved = localStorage.getItem('localcloud_buckets');
    return saved ? JSON.parse(saved) : INITIAL_BUCKETS;
  });

  const [objects, setObjects] = useState<StorageObject[]>(() => {
    const saved = localStorage.getItem('localcloud_objects');
    return saved ? JSON.parse(saved) : INITIAL_OBJECTS;
  });

  const [selectedBucket, setSelectedBucket] = useState<Bucket | null>(null);
  const [currentFolderPrefix, setCurrentFolderPrefix] = useState<string>('');

  // Compute Engine
  const [vmInstances, setVmInstances] = useState<VmInstance[]>(() => {
    const saved = localStorage.getItem('localcloud_vms');
    return saved ? JSON.parse(saved) : INITIAL_VMS;
  });
  const [selectedVm, setSelectedVm] = useState<VmInstance | null>(null);

  // VPC & Networking
  const [vpcNetworks, setVpcNetworks] = useState<VpcNetwork[]>(() => {
    const saved = localStorage.getItem('localcloud_vpc_networks');
    return saved ? JSON.parse(saved) : INITIAL_VPC_NETWORKS;
  });
  const [vpcSubnets, setVpcSubnets] = useState<VpcSubnet[]>(() => {
    const saved = localStorage.getItem('localcloud_vpc_subnets');
    return saved ? JSON.parse(saved) : INITIAL_VPC_SUBNETS;
  });
  const [firewallRules, setFirewallRules] = useState<VpcFirewallRule[]>(() => {
    const saved = localStorage.getItem('localcloud_firewall_rules');
    return saved ? JSON.parse(saved) : INITIAL_FIREWALL_RULES;
  });

  // Docker backend flag. The simulator never launches real containers, so this
  // is pinned to false and the setter is retained only so the existing UI toggle
  // keeps compiling. See src/sim/mode.ts.
  const [isDockerBackendEnabled, setIsDockerBackendEnabled] = useState<boolean>(false);

  // Pub/Sub
  const [pubsubTopics, setPubsubTopics] = useState<PubSubTopic[]>(() => {
    const saved = localStorage.getItem('localcloud_pubsub_topics');
    return saved ? JSON.parse(saved) : INITIAL_PUBSUB_TOPICS;
  });
  const [pubsubSubscriptions, setPubsubSubscriptions] = useState<PubSubSubscription[]>(() => {
    const saved = localStorage.getItem('localcloud_pubsub_subs');
    return saved ? JSON.parse(saved) : INITIAL_PUBSUB_SUBSCRIPTIONS;
  });
  const [pubsubMessages, setPubsubMessages] = useState<PubSubMessage[]>(() => {
    const saved = localStorage.getItem('localcloud_pubsub_msgs');
    return saved ? JSON.parse(saved) : INITIAL_PUBSUB_MESSAGES;
  });
  const [deadLetterMessages, setDeadLetterMessages] = useState<PubSubMessage[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<PubSubTopic | null>(null);
  const [selectedSubscription, setSelectedSubscription] = useState<PubSubSubscription | null>(null);

  // Cloud Run
  const [runServices, setRunServices] = useState<CloudRunService[]>(() => {
    const saved = localStorage.getItem('localcloud_run_services');
    return saved ? JSON.parse(saved) : INITIAL_RUN_SERVICES;
  });
  const [runLogs, setRunLogs] = useState<CloudRunLog[]>(() => {
    const saved = localStorage.getItem('localcloud_run_logs');
    return saved ? JSON.parse(saved) : INITIAL_RUN_LOGS;
  });
  const [selectedRunService, setSelectedRunService] = useState<CloudRunService | null>(null);

  // Phase 6: Secret Manager
  const [secrets, setSecrets] = useState<Secret[]>(() => {
    const saved = localStorage.getItem('localcloud_secrets');
    return saved ? JSON.parse(saved) : INITIAL_SECRETS;
  });
  const [selectedSecret, setSelectedSecret] = useState<Secret | null>(null);

  // Phase 6: BigQuery-lite
  const [bqDatasets, setBqDatasets] = useState<BigQueryDataset[]>(() => {
    const saved = localStorage.getItem('localcloud_bq_datasets');
    return saved ? JSON.parse(saved) : INITIAL_BQ_DATASETS;
  });
  const [selectedBqDataset, setSelectedBqDataset] = useState<BigQueryDataset | null>(null);
  const [selectedBqTable, setSelectedBqTable] = useState<BigQueryTable | null>(null);
  const [bqQueryHistory, setBqQueryHistory] = useState<BigQueryQueryResult[]>([]);

  // Favourites
  const [favourites, setFavourites] = useState<string[]>(() => {
    const saved = localStorage.getItem('localcloud_favourites');
    return saved ? JSON.parse(saved) : ['billing', 'iam', 'compute', 'storage', 'bigquery'];
  });

  // Recent Visits
  const [recentVisits, setRecentVisits] = useState<RecentVisitItem[]>(() => {
    const saved = localStorage.getItem('localcloud_recents');
    return saved ? JSON.parse(saved) : [
      { id: '1', title: 'APIs and services', product: 'APIs & Services', path: 'apis', timestamp: '10 mins ago' },
      { id: '2', title: 'IAM and admin', product: 'IAM & Admin', path: 'iam', timestamp: '25 mins ago' },
      { id: '3', title: 'Billing overview', product: 'Billing', path: 'billing', timestamp: '1 hour ago' },
      { id: '4', title: 'VM instances', product: 'Compute Engine', path: 'compute', timestamp: '2 hours ago' }
    ];
  });

  // Active View
  const [activeView, setActiveViewRaw] = useState<string>('home');

  // Drawers
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
  const [isCloudShellOpen, setIsCloudShellOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([
    {
      id: 'log-1',
      projectId: INITIAL_PROJECT.id,
      timestamp: new Date().toISOString(),
      principal: 'student@localcloud.dev',
      service: 'resourcemanager.googleapis.com',
      method: 'projects.get',
      resourceName: INITIAL_PROJECT.projectId,
      status: 'SUCCESS',
      details: 'Console session initialized',
    }
  ]);

  // Persist items
  useEffect(() => {
    localStorage.setItem('localcloud_projects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('localcloud_billing', JSON.stringify(billingAccount));
  }, [billingAccount]);

  useEffect(() => {
    localStorage.setItem('localcloud_members', JSON.stringify(members));
  }, [members]);

  useEffect(() => {
    localStorage.setItem('localcloud_service_accounts', JSON.stringify(serviceAccounts));
  }, [serviceAccounts]);

  useEffect(() => {
    localStorage.setItem('localcloud_apis', JSON.stringify(apiServices));
  }, [apiServices]);

  useEffect(() => {
    localStorage.setItem('localcloud_buckets', JSON.stringify(buckets));
  }, [buckets]);

  useEffect(() => {
    localStorage.setItem('localcloud_objects', JSON.stringify(objects));
  }, [objects]);

  useEffect(() => {
    localStorage.setItem('localcloud_vms', JSON.stringify(vmInstances));
  }, [vmInstances]);

  useEffect(() => {
    localStorage.setItem('localcloud_vpc_networks', JSON.stringify(vpcNetworks));
  }, [vpcNetworks]);

  useEffect(() => {
    localStorage.setItem('localcloud_vpc_subnets', JSON.stringify(vpcSubnets));
  }, [vpcSubnets]);

  useEffect(() => {
    localStorage.setItem('localcloud_firewall_rules', JSON.stringify(firewallRules));
  }, [firewallRules]);

  useEffect(() => {
    localStorage.setItem('localcloud_favourites', JSON.stringify(favourites));
  }, [favourites]);

  useEffect(() => {
    localStorage.setItem('localcloud_recents', JSON.stringify(recentVisits));
  }, [recentVisits]);

  useEffect(() => {
    localStorage.setItem('localcloud_theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  const logAuditAction = (
    service: string,
    method: string,
    resourceName: string,
    status: 'SUCCESS' | 'DENIED' | 'FAILED' = 'SUCCESS',
    details?: string
  ) => {
    const newEntry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      projectId: currentProject.id,
      timestamp: new Date().toISOString(),
      principal: 'student@localcloud.dev',
      service,
      method,
      resourceName,
      status,
      details,
    };
    setAuditLogs(prev => [newEntry, ...prev.slice(0, 99)]);
  };

  const setActiveView = (view: string, itemTitle?: string, productName?: string) => {
    setActiveViewRaw(view);
    if (itemTitle && productName && view !== 'home') {
      setRecentVisits(prev => {
        const filtered = prev.filter(r => r.path !== view);
        return [
          {
            id: Date.now().toString(),
            title: itemTitle,
            product: productName,
            path: view,
            timestamp: 'Just now',
          },
          ...filtered.slice(0, 9),
        ];
      });
    }
    // Close nav drawer on mobile or selection
    setIsNavDrawerOpen(false);
  };

  // Billing Checks
  const isBillingEnabledForCurrentProject = billingAccount.linkedProjectIds.includes(currentProject.id);

  const linkProjectBilling = (projectId: string, enable: boolean) => {
    setBillingAccount(prev => {
      const currentList = prev.linkedProjectIds;
      let updatedList = [...currentList];
      if (enable && !updatedList.includes(projectId)) {
        updatedList.push(projectId);
      } else if (!enable) {
        updatedList = updatedList.filter(id => id !== projectId);
      }
      return {
        ...prev,
        linkedProjectIds: updatedList,
      };
    });
    setProjects(prev =>
      prev.map(p => (p.id === projectId ? { ...p, billingAccountId: enable ? billingAccount.id : null } : p))
    );
    logAuditAction(
      'cloudbilling.googleapis.com',
      enable ? 'ProjectBillingInfo.update' : 'ProjectBillingInfo.disable',
      `projects/${projectId}/billingInfo`,
      'SUCCESS',
      enable ? 'Billing account linked' : 'Billing account removed'
    );
    showToast(enable ? 'Billing account linked successfully' : 'Billing account unlinked');
  };

  const updateVirtualBalance = (amount: number) => {
    setBillingAccount(prev => ({
      ...prev,
      virtualBalance: Math.max(0, prev.virtualBalance + amount),
      totalSpent: prev.totalSpent + (amount < 0 ? Math.abs(amount) : 0),
    }));
  };

  // Projects
  const createProject = (name: string, customProjectId?: string) => {
    const randomNum = Math.floor(100000 + Math.random() * 900000).toString();
    const pid = customProjectId || `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${randomNum.substring(0, 4)}`;
    const newProj: Project = {
      id: `proj-${randomNum}`,
      name,
      projectNumber: randomNum,
      projectId: pid,
      billingAccountId: billingAccount.id,
      createdAt: new Date().toISOString(),
    };
    setProjects(prev => [...prev, newProj]);
    setCurrentProject(newProj);
    // Link billing by default
    setBillingAccount(prev => ({
      ...prev,
      linkedProjectIds: [...prev.linkedProjectIds, newProj.id],
    }));
    logAuditAction('resourcemanager.googleapis.com', 'projects.create', `projects/${newProj.projectId}`, 'SUCCESS');
    showToast(`Project "${name}" created`);
    return newProj;
  };

  // IAM Members
  const addMember = (principal: string, roles: CloudRole[], type: 'user' | 'serviceAccount' | 'group' = 'user') => {
    const newMember: IamMember = {
      id: `mem-${Date.now()}`,
      projectId: currentProject.id,
      principal,
      type,
      roles,
      createdAt: new Date().toISOString(),
    };
    setMembers(prev => [...prev, newMember]);
    logAuditAction(
      'iam.googleapis.com',
      'projects.setIamPolicy',
      `projects/${currentProject.projectId}`,
      'SUCCESS',
      `Granted [${roles.join(', ')}] to ${principal}`
    );
    showToast(`Granted roles to ${principal}`);
  };

  const updateMemberRoles = (id: string, roles: CloudRole[]) => {
    setMembers(prev => prev.map(m => (m.id === id ? { ...m, roles } : m)));
    showToast('Updated member permissions');
  };

  const removeMember = (id: string) => {
    const target = members.find(m => m.id === id);
    setMembers(prev => prev.filter(m => m.id !== id));
    if (target) {
      logAuditAction(
        'iam.googleapis.com',
        'projects.setIamPolicy',
        `projects/${currentProject.projectId}`,
        'SUCCESS',
        `Revoked permissions for ${target.principal}`
      );
    }
    showToast('Member removed from project');
  };

  // Service Accounts
  const createServiceAccount = (name: string, displayName: string, description: string) => {
    const email = `${name}@${currentProject.projectId}.iam.gserviceaccount.com`;
    const newSa: ServiceAccount = {
      id: `sa-${Date.now()}`,
      projectId: currentProject.id,
      name,
      displayName,
      email,
      description,
      keysCount: 0,
      createdAt: new Date().toISOString(),
      disabled: false,
    };
    setServiceAccounts(prev => [...prev, newSa]);
    logAuditAction('iam.googleapis.com', 'serviceAccounts.create', email, 'SUCCESS');
    showToast(`Service account ${name} created`);
    return newSa;
  };

  const deleteServiceAccount = (id: string) => {
    const target = serviceAccounts.find(s => s.id === id);
    setServiceAccounts(prev => prev.filter(s => s.id !== id));
    if (target) {
      logAuditAction('iam.googleapis.com', 'serviceAccounts.delete', target.email, 'SUCCESS');
    }
    showToast('Service account deleted');
  };

  // APIs
  const toggleApi = (apiId: string, enabled: boolean) => {
    setApiServices(prev => prev.map(api => (api.id === apiId ? { ...api, enabled } : api)));
    const target = apiServices.find(a => a.id === apiId);
    logAuditAction(
      'serviceusage.googleapis.com',
      enabled ? 'services.enable' : 'services.disable',
      `services/${apiId}`,
      'SUCCESS',
      `${target?.title || apiId} ${enabled ? 'enabled' : 'disabled'}`
    );
    showToast(`${target?.title || apiId} ${enabled ? 'enabled' : 'disabled'}`);
  };

  const isApiEnabled = (apiId: string) => {
    const found = apiServices.find(a => a.id === apiId);
    return found ? found.enabled : false;
  };

  // Cloud Storage Methods
  const createBucket = (data: Partial<Bucket>): Bucket => {
    const bucketName = data.name || `bucket-${Date.now()}`;
    const newBucket: Bucket = {
      id: `b-${Date.now()}`,
      projectId: currentProject.id,
      name: bucketName,
      location: data.location || 'us-central1',
      locationType: data.locationType || 'Region',
      storageClass: data.storageClass || 'STANDARD',
      accessControl: data.accessControl || 'UNIFORM',
      publicAccessPrevention: data.publicAccessPrevention ?? false,
      isPublic: data.isPublic ?? false,
      versioning: data.versioning ?? false,
      encryption: data.encryption || 'Google-managed',
      retentionDays: data.retentionDays,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lifecycleRules: data.lifecycleRules || [],
      iamMembers: data.iamMembers || [
        { principal: 'student@localcloud.dev', role: 'roles/storage.admin' }
      ]
    };
    setBuckets(prev => [newBucket, ...prev]);
    logAuditAction(
      'storage.googleapis.com',
      'storage.buckets.insert',
      `buckets/${bucketName}`,
      'SUCCESS',
      `Created bucket in ${newBucket.location} (${newBucket.storageClass})`
    );
    showToast(`Bucket "${bucketName}" created successfully`);
    return newBucket;
  };

  const deleteBucket = (bucketId: string) => {
    const target = buckets.find(b => b.id === bucketId || b.name === bucketId);
    if (!target) return;
    setBuckets(prev => prev.filter(b => b.id !== target.id));
    setObjects(prev => prev.filter(o => o.bucketId !== target.id && o.bucketName !== target.name));
    if (selectedBucket?.id === target.id) setSelectedBucket(null);
    logAuditAction('storage.googleapis.com', 'storage.buckets.delete', `buckets/${target.name}`, 'SUCCESS');
    showToast(`Bucket "${target.name}" deleted`);
  };

  const updateBucket = (bucketId: string, updates: Partial<Bucket>) => {
    setBuckets(prev =>
      prev.map(b => (b.id === bucketId || b.name === bucketId ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b))
    );
    if (selectedBucket && (selectedBucket.id === bucketId || selectedBucket.name === bucketId)) {
      setSelectedBucket(prev => (prev ? { ...prev, ...updates } : null));
    }
    showToast('Bucket configuration updated');
  };

  const uploadObject = (
    bucketName: string,
    name: string,
    fileData: { name: string; size: number; type: string; content?: string }
  ): StorageObject => {
    const targetBucket = buckets.find(b => b.name === bucketName || b.id === bucketName);
    const cleanName = name.startsWith('/') ? name.substring(1) : name;
    const newObj: StorageObject = {
      id: `obj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      bucketId: targetBucket?.id || 'b-custom',
      bucketName: bucketName,
      name: cleanName,
      contentType: fileData.type || 'application/octet-stream',
      size: fileData.size || (fileData.content ? fileData.content.length : 1024),
      storageClass: targetBucket?.storageClass || 'STANDARD',
      updatedAt: new Date().toISOString(),
      contentData: fileData.content || 'Simulated file content from LocalCloud',
      md5Hash: Math.random().toString(16).substring(2, 34),
    };
    setObjects(prev => {
      const filtered = prev.filter(o => !(o.bucketName === bucketName && o.name === cleanName));
      return [newObj, ...filtered];
    });
    logAuditAction(
      'storage.googleapis.com',
      'storage.objects.insert',
      `b/${bucketName}/o/${cleanName}`,
      'SUCCESS',
      `Uploaded ${fileData.size} bytes`
    );
    showToast(`Uploaded "${cleanName}" to gs://${bucketName}`);
    return newObj;
  };

  const deleteObject = (objectId: string) => {
    const target = objects.find(o => o.id === objectId);
    setObjects(prev => prev.filter(o => o.id !== objectId));
    if (target) {
      logAuditAction(
        'storage.googleapis.com',
        'storage.objects.delete',
        `b/${target.bucketName}/o/${target.name}`,
        'SUCCESS'
      );
      showToast(`Deleted ${target.name}`);
    }
  };

  const addLifecycleRule = (bucketId: string, rule: Omit<LifecycleRule, 'id'>) => {
    const newRule: LifecycleRule = {
      ...rule,
      id: `lr-${Date.now()}`,
    };
    const target = buckets.find(b => b.id === bucketId || b.name === bucketId);
    if (!target) return;
    updateBucket(bucketId, {
      lifecycleRules: [...target.lifecycleRules, newRule],
    });
    logAuditAction(
      'storage.googleapis.com',
      'storage.buckets.patch',
      `buckets/${target.name}`,
      'SUCCESS',
      `Added lifecycle rule: ${rule.action}`
    );
    showToast('Lifecycle rule added');
  };

  const deleteLifecycleRule = (bucketId: string, ruleId: string) => {
    const target = buckets.find(b => b.id === bucketId || b.name === bucketId);
    if (!target) return;
    updateBucket(bucketId, {
      lifecycleRules: target.lifecycleRules.filter(r => r.id !== ruleId),
    });
    showToast('Lifecycle rule removed');
  };

  const addBucketIamMember = (bucketId: string, principal: string, role: string) => {
    const target = buckets.find(b => b.id === bucketId || b.name === bucketId);
    if (!target) return;
    const isAllUsers = principal === 'allUsers';
    const updatedMembers = [
      ...target.iamMembers.filter(m => !(m.principal === principal && m.role === role)),
      { principal, role },
    ];
    updateBucket(bucketId, {
      iamMembers: updatedMembers,
      isPublic: isAllUsers ? true : target.isPublic,
    });
    logAuditAction(
      'storage.googleapis.com',
      'storage.buckets.setIamPolicy',
      `buckets/${target.name}`,
      'SUCCESS',
      `Granted ${role} to ${principal}`
    );
    showToast(`Granted ${role} to ${principal}`);
  };

  const removeBucketIamMember = (bucketId: string, principal: string) => {
    const target = buckets.find(b => b.id === bucketId || b.name === bucketId);
    if (!target) return;
    const remaining = target.iamMembers.filter(m => m.principal !== principal);
    const hasPublic = remaining.some(m => m.principal === 'allUsers');
    updateBucket(bucketId, {
      iamMembers: remaining,
      isPublic: hasPublic,
    });
    showToast(`Removed permissions for ${principal}`);
  };

  // Compute Engine State Machine & Operations
  const createVmInstance = (data: Partial<VmInstance>): VmInstance => {
    const vmName = data.name || `instance-${Date.now().toString().slice(-4)}`;
    const randomHost = Math.floor(2 + Math.random() * 250);
    const randomExt = Math.floor(1 + Math.random() * 254);
    const newVm: VmInstance = {
      id: `vm-${Date.now()}`,
      projectId: currentProject.id,
      name: vmName,
      description: data.description || '',
      zone: data.zone || 'us-central1-a',
      machineType: data.machineType || 'e2-micro',
      cpuCount: data.cpuCount || 2,
      memoryGb: data.memoryGb || 1,
      status: 'PROVISIONING',
      internalIp: `10.128.0.${randomHost}`,
      externalIp: `34.68.102.${randomExt}`,
      osImage: data.osImage || 'Debian GNU/Linux 12 (bookworm)',
      bootDiskSizeGb: data.bootDiskSizeGb || 10,
      bootDiskType: data.bootDiskType || 'pd-standard',
      allowHttp: data.allowHttp ?? true,
      allowHttps: data.allowHttps ?? true,
      networkTags: data.networkTags || ['http-server'],
      serviceAccountEmail: data.serviceAccountEmail || `${currentProject.projectNumber}-compute@developer.gserviceaccount.com`,
      networkName: data.networkName || 'default',
      subnetName: data.subnetName || 'default-us-central1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dockerContainerId: isDockerBackendEnabled ? `cntr-${Math.random().toString(36).slice(2, 10)}` : undefined,
    };

    setVmInstances(prev => [newVm, ...prev]);
    logAuditAction(
      'compute.googleapis.com',
      'compute.instances.insert',
      `zones/${newVm.zone}/instances/${newVm.name}`,
      'SUCCESS',
      `Operation "operations/op-vm-${Date.now()}" created`
    );
    showToast(`Creating instance "${vmName}" (Operation running)`);

    // State machine: PROVISIONING (0-1.5s) -> STAGING (1.5-3.5s) -> RUNNING
    setTimeout(() => {
      setVmInstances(prev =>
        prev.map(vm => (vm.id === newVm.id && vm.status === 'PROVISIONING' ? { ...vm, status: 'STAGING', updatedAt: new Date().toISOString() } : vm))
      );
    }, 1500);

    setTimeout(() => {
      setVmInstances(prev =>
        prev.map(vm => (vm.id === newVm.id && (vm.status === 'PROVISIONING' || vm.status === 'STAGING') ? { ...vm, status: 'RUNNING', updatedAt: new Date().toISOString() } : vm))
      );
      showToast(`Instance "${vmName}" is now RUNNING`);
      logAuditAction('compute.googleapis.com', 'operations.wait', `operations/op-vm-${newVm.id}`, 'SUCCESS', 'Instance status: RUNNING');
    }, 3500);

    // Accrue virtual cost into billing totalSpent
    const estCost = newVm.machineType === 'e2-micro' ? 7.11 : newVm.machineType === 'e2-small' ? 14.22 : 26.72;
    updateVirtualBalance(-(estCost / 730)); // 1 simulated hour of cost

    return newVm;
  };

  const startVmInstance = (id: string) => {
    const target = vmInstances.find(vm => vm.id === id);
    if (!target) return;
    setVmInstances(prev => prev.map(vm => (vm.id === id ? { ...vm, status: 'PROVISIONING', updatedAt: new Date().toISOString() } : vm)));
    logAuditAction('compute.googleapis.com', 'compute.instances.start', `zones/${target.zone}/instances/${target.name}`, 'SUCCESS');
    showToast(`Starting instance "${target.name}"...`);

    setTimeout(() => {
      setVmInstances(prev => prev.map(vm => (vm.id === id ? { ...vm, status: 'RUNNING', updatedAt: new Date().toISOString() } : vm)));
      showToast(`Instance "${target.name}" started successfully`);
    }, 2000);
  };

  const stopVmInstance = (id: string) => {
    const target = vmInstances.find(vm => vm.id === id);
    if (!target) return;
    setVmInstances(prev => prev.map(vm => (vm.id === id ? { ...vm, status: 'STOPPING', updatedAt: new Date().toISOString() } : vm)));
    logAuditAction('compute.googleapis.com', 'compute.instances.stop', `zones/${target.zone}/instances/${target.name}`, 'SUCCESS');
    showToast(`Stopping instance "${target.name}"...`);

    setTimeout(() => {
      setVmInstances(prev => prev.map(vm => (vm.id === id ? { ...vm, status: 'TERMINATED', updatedAt: new Date().toISOString() } : vm)));
      showToast(`Instance "${target.name}" stopped (TERMINATED)`);
    }, 1800);
  };

  const resetVmInstance = (id: string) => {
    const target = vmInstances.find(vm => vm.id === id);
    if (!target) return;
    setVmInstances(prev => prev.map(vm => (vm.id === id ? { ...vm, status: 'REPAIRING', updatedAt: new Date().toISOString() } : vm)));
    logAuditAction('compute.googleapis.com', 'compute.instances.reset', `zones/${target.zone}/instances/${target.name}`, 'SUCCESS');
    showToast(`Resetting instance "${target.name}"...`);

    setTimeout(() => {
      setVmInstances(prev => prev.map(vm => (vm.id === id ? { ...vm, status: 'RUNNING', updatedAt: new Date().toISOString() } : vm)));
      showToast(`Instance "${target.name}" reset and is RUNNING`);
    }, 2000);
  };

  const deleteVmInstance = (id: string) => {
    const target = vmInstances.find(vm => vm.id === id);
    if (!target) return;
    setVmInstances(prev => prev.filter(vm => vm.id !== id));
    if (selectedVm?.id === id) setSelectedVm(null);
    logAuditAction('compute.googleapis.com', 'compute.instances.delete', `zones/${target.zone}/instances/${target.name}`, 'SUCCESS');
    showToast(`Instance "${target.name}" deleted`);
  };

  const connectSshToVm = (vm: VmInstance) => {
    setIsCloudShellOpen(true);
    executeCliCommand(`gcloud compute ssh ${vm.name} --zone=${vm.zone}`);
    showToast(`Opening SSH terminal to ${vm.name}`);
  };

  // VPC & Firewall Methods
  const createFirewallRule = (rule: Partial<VpcFirewallRule>): VpcFirewallRule => {
    const newRule: VpcFirewallRule = {
      id: `fw-${Date.now()}`,
      projectId: currentProject.id,
      networkName: rule.networkName || 'default',
      name: rule.name || `custom-rule-${Date.now().toString().slice(-4)}`,
      direction: rule.direction || 'INGRESS',
      priority: rule.priority || 1000,
      action: rule.action || 'ALLOW',
      targets: rule.targets || 'Apply to all',
      sourceRanges: rule.sourceRanges || '0.0.0.0/0',
      protocolsAndPorts: rule.protocolsAndPorts || 'tcp:8080',
      description: rule.description || 'Custom firewall rule created in LocalCloud',
      disabled: false,
    };
    setFirewallRules(prev => [...prev, newRule]);
    logAuditAction('compute.googleapis.com', 'compute.firewalls.insert', `firewalls/${newRule.name}`, 'SUCCESS');
    showToast(`Firewall rule "${newRule.name}" created`);
    return newRule;
  };

  const deleteFirewallRule = (id: string) => {
    const target = firewallRules.find(f => f.id === id);
    setFirewallRules(prev => prev.filter(f => f.id !== id));
    if (target) {
      logAuditAction('compute.googleapis.com', 'compute.firewalls.delete', `firewalls/${target.name}`, 'SUCCESS');
      showToast(`Firewall rule "${target.name}" deleted`);
    }
  };

  // Phase 5: Pub/Sub Methods
  const createPubsubTopic = (name: string, retentionDays = 7): PubSubTopic => {
    const cleanName = name.trim().toLowerCase();
    const newTopic: PubSubTopic = {
      id: `top-${Date.now()}`,
      projectId: currentProject.id,
      name: cleanName,
      retentionDays,
      messageCount: 0,
      createdAt: new Date().toISOString(),
    };
    setPubsubTopics(prev => [newTopic, ...prev]);
    logAuditAction('pubsub.googleapis.com', 'topics.create', `projects/${currentProject.projectId}/topics/${cleanName}`, 'SUCCESS');
    showToast(`Topic "${cleanName}" created`);
    return newTopic;
  };

  const deletePubsubTopic = (id: string) => {
    const target = pubsubTopics.find(t => t.id === id || t.name === id);
    if (!target) return;
    setPubsubTopics(prev => prev.filter(t => t.id !== target.id));
    setPubsubSubscriptions(prev => prev.filter(s => s.topicName !== target.name));
    setPubsubMessages(prev => prev.filter(m => m.topicName !== target.name));
    if (selectedTopic?.id === target.id) setSelectedTopic(null);
    logAuditAction('pubsub.googleapis.com', 'topics.delete', `projects/${currentProject.projectId}/topics/${target.name}`, 'SUCCESS');
    showToast(`Topic "${target.name}" deleted`);
  };

  const createPubsubSubscription = (data: Partial<PubSubSubscription>): PubSubSubscription => {
    const subName = data.name || `sub-${Date.now()}`;
    const newSub: PubSubSubscription = {
      id: `sub-${Date.now()}`,
      projectId: currentProject.id,
      name: subName,
      topicName: data.topicName || 'order-events',
      deliveryType: data.deliveryType || 'PULL',
      pushEndpoint: data.pushEndpoint,
      ackDeadlineSeconds: data.ackDeadlineSeconds || 10,
      retainAckedMessages: data.retainAckedMessages ?? false,
      retentionDays: data.retentionDays || 7,
      deadLetterTopic: data.deadLetterTopic,
      maxDeliveryAttempts: data.maxDeliveryAttempts || 5,
      createdAt: new Date().toISOString(),
    };
    setPubsubSubscriptions(prev => [newSub, ...prev]);
    logAuditAction('pubsub.googleapis.com', 'subscriptions.create', `projects/${currentProject.projectId}/subscriptions/${subName}`, 'SUCCESS');
    showToast(`Subscription "${subName}" created`);
    return newSub;
  };

  const deletePubsubSubscription = (id: string) => {
    const target = pubsubSubscriptions.find(s => s.id === id || s.name === id);
    if (!target) return;
    setPubsubSubscriptions(prev => prev.filter(s => s.id !== target.id));
    if (selectedSubscription?.id === target.id) setSelectedSubscription(null);
    logAuditAction('pubsub.googleapis.com', 'subscriptions.delete', `projects/${currentProject.projectId}/subscriptions/${target.name}`, 'SUCCESS');
    showToast(`Subscription "${target.name}" deleted`);
  };

  const publishPubsubMessage = (
    topicName: string,
    data: string,
    attributes: Record<string, string> = {},
    orderingKey?: string
  ): PubSubMessage => {
    const msgId = `${Date.now().toString()}${Math.floor(100 + Math.random() * 900)}`;
    const newMsg: PubSubMessage = {
      id: msgId,
      topicName,
      data,
      attributes,
      orderingKey,
      publishTime: new Date().toISOString(),
      deliveryAttempts: 1,
    };

    setPubsubMessages(prev => [newMsg, ...prev]);
    setPubsubTopics(prev =>
      prev.map(t => (t.name === topicName ? { ...t, messageCount: t.messageCount + 1 } : t))
    );

    logAuditAction(
      'pubsub.googleapis.com',
      'topics.publish',
      `projects/${currentProject.projectId}/topics/${topicName}`,
      'SUCCESS',
      `Published message ${msgId} (${data.length} bytes)`
    );
    showToast(`Published message to ${topicName}`);
    return newMsg;
  };

  const pullPubsubMessages = (subscriptionName: string, maxMessages = 10): PulledMessage[] => {
    const sub = pubsubSubscriptions.find(s => s.name === subscriptionName);
    if (!sub) return [];

    const available = pubsubMessages
      .filter(m => m.topicName === sub.topicName)
      .slice(0, maxMessages);

    // Track delivery attempts
    setPubsubMessages(prev =>
      prev.map(m => {
        if (available.some(a => a.id === m.id)) {
          return { ...m, deliveryAttempts: m.deliveryAttempts + 1 };
        }
        return m;
      })
    );

    return available.map(m => ({
      ackId: `ack-${m.id}-${Date.now()}`,
      message: m,
      deliveryAttempt: m.deliveryAttempts,
    }));
  };

  const ackPubsubMessage = (subscriptionName: string, ackId: string) => {
    const parts = ackId.split('-');
    const msgId = parts[1];
    setPubsubMessages(prev => prev.filter(m => m.id !== msgId));
    logAuditAction('pubsub.googleapis.com', 'subscriptions.acknowledge', subscriptionName, 'SUCCESS', `Acked message ID ${msgId}`);
    showToast(`Acknowledged message`);
  };

  const nackPubsubMessage = (subscriptionName: string, ackId: string) => {
    const parts = ackId.split('-');
    const msgId = parts[1];
    const sub = pubsubSubscriptions.find(s => s.name === subscriptionName);
    const msg = pubsubMessages.find(m => m.id === msgId);

    if (sub && msg) {
      if (sub.deadLetterTopic && msg.deliveryAttempts >= sub.maxDeliveryAttempts) {
        // Move to dead letter queue!
        setPubsubMessages(prev => prev.filter(m => m.id !== msgId));
        setDeadLetterMessages(prev => [{ ...msg, topicName: sub.deadLetterTopic! }, ...prev]);
        setPubsubTopics(prev =>
          prev.map(t => (t.name === sub.deadLetterTopic ? { ...t, messageCount: t.messageCount + 1 } : t))
        );
        logAuditAction(
          'pubsub.googleapis.com',
          'subscriptions.deadLetter',
          `projects/${currentProject.projectId}/subscriptions/${subscriptionName}`,
          'FAILED',
          `Message ${msgId} exceeded ${sub.maxDeliveryAttempts} delivery attempts. Routed to dead-letter topic [${sub.deadLetterTopic}].`
        );
        showToast(`Message exceeded ${sub.maxDeliveryAttempts} attempts -> Forwarded to Dead-Letter Topic [${sub.deadLetterTopic}]`);
        return;
      }
    }

    showToast(`Nacked message (returned to subscriber queue)`);
  };

  // Phase 5: Cloud Run Methods
  const deployRunService = (
    data: Partial<CloudRunService> & { initialRevision?: Partial<CloudRunRevision> }
  ): CloudRunService => {
    const sName = (data.name || `service-${Date.now().toString().slice(-4)}`).toLowerCase();
    const region = data.region || 'us-central1';
    const regCode = region.replace(/[^a-z0-9]/g, '').slice(0, 2);
    const serviceUrl = `https://${sName}-${currentProject.projectNumber}-${regCode}.a.run.app`;

    const revName = `${sName}-00001-${Math.random().toString(36).slice(2, 6)}`;
    const newRevision: CloudRunRevision = {
      id: `rev-${Date.now()}`,
      serviceId: data.id || `run-${Date.now()}`,
      name: revName,
      image: data.initialRevision?.image || 'gcr.io/google-samples/hello-app:1.0',
      sourceType: data.initialRevision?.sourceType || 'NODE',
      sourceCode: data.initialRevision?.sourceCode,
      trafficPercent: 100,
      cpu: data.initialRevision?.cpu || '1',
      memory: data.initialRevision?.memory || '512Mi',
      minInstances: data.initialRevision?.minInstances ?? 0,
      maxInstances: data.initialRevision?.maxInstances ?? 10,
      createdAt: new Date().toISOString(),
    };

    const newService: CloudRunService = {
      id: data.id || `run-${Date.now()}`,
      projectId: currentProject.id,
      name: sName,
      region,
      url: serviceUrl,
      latestRevisionName: revName,
      allowUnauthenticated: data.allowUnauthenticated ?? true,
      status: 'READY',
      envVars: data.envVars || { NODE_ENV: 'production', PORT: '8080' },
      activeInstances: newRevision.minInstances > 0 ? newRevision.minInstances : 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revisions: [newRevision],
    };

    setRunServices(prev => [newService, ...prev.filter(s => s.id !== newService.id && s.name !== newService.name)]);

    // Initial deployment log
    const deployLog: CloudRunLog = {
      id: `log-${Date.now()}`,
      serviceId: newService.id,
      revisionName: revName,
      timestamp: new Date().toISOString(),
      severity: 'INFO',
      textPayload: `Service ${sName} revision ${revName} deployed successfully. Ready to route 100% traffic.`,
    };
    setRunLogs(prev => [deployLog, ...prev]);

    logAuditAction(
      'run.googleapis.com',
      'services.create',
      `namespaces/${currentProject.projectId}/services/${sName}`,
      'SUCCESS',
      `Configuration revision ${revName} deployed to ${serviceUrl}`
    );
    showToast(`Service "${sName}" deployed to ${serviceUrl}`);
    return newService;
  };

  const deleteRunService = (serviceId: string) => {
    const target = runServices.find(s => s.id === serviceId || s.name === serviceId);
    if (!target) return;
    setRunServices(prev => prev.filter(s => s.id !== target.id));
    setRunLogs(prev => prev.filter(l => l.serviceId !== target.id));
    if (selectedRunService?.id === target.id) setSelectedRunService(null);
    logAuditAction('run.googleapis.com', 'services.delete', `namespaces/${currentProject.projectId}/services/${target.name}`, 'SUCCESS');
    showToast(`Service "${target.name}" deleted`);
  };

  const invokeRunService = async (
    serviceId: string,
    path = '/',
    method = 'GET',
    headers: Record<string, string> = {},
    body?: string
  ): Promise<{ status: number; data: any; headers: Record<string, string>; latencyMs: number }> => {
    const service = runServices.find(s => s.id === serviceId);
    if (!service) {
      throw new Error(`Service ${serviceId} not found`);
    }

    // Scale-up instance count demonstration
    setRunServices(prev =>
      prev.map(s => (s.id === serviceId ? { ...s, activeInstances: Math.max(1, s.activeInstances) } : s))
    );

    const start = Date.now();
    await new Promise(r => setTimeout(r, 60 + Math.random() * 80));
    const latency = Date.now() - start;

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    let status = 200;
    let responseData: any = {};

    if (normalizedPath === '/' || normalizedPath === '') {
      responseData = {
        message: 'Hello from Cloud Run on LocalCloud!',
        service: service.name,
        region: service.region,
        revision: service.latestRevisionName,
        timestamp: new Date().toISOString(),
        environment: service.envVars,
      };
    } else if (normalizedPath === '/healthz' || normalizedPath === '/health') {
      responseData = { status: 'healthy', uptimeSeconds: 1248 };
    } else if (normalizedPath === '/echo') {
      responseData = {
        method,
        path: normalizedPath,
        receivedBody: body ? (body.startsWith('{') ? JSON.parse(body) : body) : null,
        receivedHeaders: headers,
        timestamp: new Date().toISOString(),
      };
    } else {
      responseData = {
        path: normalizedPath,
        method,
        service: service.name,
        activeInstances: service.activeInstances,
        timestamp: new Date().toISOString(),
      };
    }

    const logEntry: CloudRunLog = {
      id: `log-${Date.now()}`,
      serviceId,
      revisionName: service.latestRevisionName,
      timestamp: new Date().toISOString(),
      severity: status >= 400 ? 'ERROR' : 'INFO',
      textPayload: `${method} ${status} ${latency}ms ${normalizedPath}`,
      httpStatus: status,
      latencyMs: latency,
    };

    setRunLogs(prev => [logEntry, ...prev]);

    return {
      status,
      data: responseData,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-cloud-trace-context': `trace-${Date.now()}/1;o=1`,
        'server': 'Google Frontend (LocalCloud Emulator)',
      },
      latencyMs: latency,
    };
  };

  // Phase 6: Secret Manager Methods
  const createSecret = (name: string, payload: string, labels: Record<string, string> = {}): Secret => {
    const cleanName = name.trim().toLowerCase();
    const newSecret: Secret = {
      id: `sec-${Date.now()}`,
      projectId: currentProject.id,
      name: cleanName,
      replication: 'AUTOMATIC',
      labels,
      createdAt: new Date().toISOString(),
      versions: [
        {
          version: '1',
          state: 'ENABLED',
          createdAt: new Date().toISOString(),
          payload,
        },
      ],
    };
    setSecrets(prev => [newSecret, ...prev]);
    logAuditAction('secretmanager.googleapis.com', 'secrets.create', `projects/${currentProject.projectId}/secrets/${cleanName}`, 'SUCCESS');
    showToast(`Secret "${cleanName}" created`);
    return newSecret;
  };

  const deleteSecret = (secretId: string) => {
    const target = secrets.find(s => s.id === secretId || s.name === secretId);
    if (!target) return;
    setSecrets(prev => prev.filter(s => s.id !== target.id));
    if (selectedSecret?.id === target.id) setSelectedSecret(null);
    logAuditAction('secretmanager.googleapis.com', 'secrets.delete', `projects/${currentProject.projectId}/secrets/${target.name}`, 'SUCCESS');
    showToast(`Secret "${target.name}" deleted`);
  };

  const addSecretVersion = (secretId: string, payload: string): SecretVersion => {
    const target = secrets.find(s => s.id === secretId || s.name === secretId);
    const nextVer = target ? String(target.versions.length + 1) : '1';
    const newVersion: SecretVersion = {
      version: nextVer,
      state: 'ENABLED',
      createdAt: new Date().toISOString(),
      payload,
    };
    setSecrets(prev =>
      prev.map(s => (s.id === target?.id ? { ...s, versions: [newVersion, ...s.versions] } : s))
    );
    if (target) {
      logAuditAction('secretmanager.googleapis.com', 'secrets.addVersion', `projects/${currentProject.projectId}/secrets/${target.name}/versions/${nextVer}`, 'SUCCESS');
    }
    showToast(`Added version ${nextVer} to ${target?.name || 'secret'}`);
    return newVersion;
  };

  const destroySecretVersion = (secretId: string, version: string) => {
    setSecrets(prev =>
      prev.map(s =>
        s.id === secretId || s.name === secretId
          ? {
              ...s,
              versions: s.versions.map(v => (v.version === version ? { ...v, state: 'DESTROYED' as const } : v)),
            }
          : s
      )
    );
    showToast(`Destroyed version ${version}`);
  };

  // Phase 6: BigQuery-lite Query Engine
  const executeBigQuery = (sql: string): BigQueryQueryResult => {
    const trimmed = sql.trim();
    const start = Date.now();
    let columns: string[] = [];
    let rows: any[][] = [];

    // All available tables flattened
    const allTables: Record<string, BigQueryTable> = {};
    bqDatasets.forEach(ds => {
      ds.tables.forEach(tbl => {
        allTables[tbl.name] = tbl;
        allTables[`${ds.name}.${tbl.name}`] = tbl;
      });
    });

    // Detect target table
    const fromMatch = trimmed.match(/FROM\s+([`'"]?[a-zA-Z0-9_.-]+[`'"]?)/i);
    const rawTarget = fromMatch ? fromMatch[1].replace(/[`'"]/g, '') : '';
    const table = allTables[rawTarget] || Object.values(allTables)[0];

    if (table) {
      const isCount = /SELECT\s+count\(\*\)/i.test(trimmed);
      if (isCount) {
        columns = ['count'];
        rows = [[table.rows.length]];
      } else {
        // Detect selected columns
        const selectMatch = trimmed.match(/SELECT\s+(.*?)\s+FROM/is);
        const colString = selectMatch ? selectMatch[1].trim() : '*';

        if (colString === '*') {
          columns = table.columns.map(c => c.name);
          rows = table.rows.map(r => columns.map(c => r[c]));
        } else {
          const reqCols = colString.split(',').map(s => s.trim().replace(/[`'"]/g, ''));
          columns = reqCols.filter(rc => table.columns.some(c => c.name === rc));
          if (columns.length === 0) columns = table.columns.map(c => c.name);
          rows = table.rows.map(r => columns.map(c => r[c]));
        }

        // Handle simple WHERE filter
        const whereMatch = trimmed.match(/WHERE\s+([a-zA-Z0-9_]+)\s*(=|>|<)\s*['"]?([a-zA-Z0-9_.-]+)['"]?/i);
        if (whereMatch) {
          const filterCol = whereMatch[1];
          const filterOp = whereMatch[2];
          const filterVal = whereMatch[3];
          const colIdx = columns.indexOf(filterCol);
          if (colIdx !== -1) {
            rows = rows.filter(r => {
              const cellVal = String(r[colIdx]);
              if (filterOp === '=') return cellVal.toLowerCase() === filterVal.toLowerCase();
              if (filterOp === '>') return parseFloat(cellVal) > parseFloat(filterVal);
              if (filterOp === '<') return parseFloat(cellVal) < parseFloat(filterVal);
              return true;
            });
          }
        }

        // Handle LIMIT
        const limitMatch = trimmed.match(/LIMIT\s+(\d+)/i);
        if (limitMatch) {
          const limit = parseInt(limitMatch[1]);
          rows = rows.slice(0, limit);
        }
      }
    } else {
      columns = ['result'];
      rows = [['Query executed successfully on LocalCloud emulator.']];
    }

    const latency = Math.max(8, Date.now() - start);
    const bytesProcessed = Math.floor(1024 + Math.random() * 4096);

    const result: BigQueryQueryResult = {
      columns,
      rows,
      totalRows: rows.length,
      bytesProcessed,
      executionTimeMs: latency,
      query: trimmed,
      executedAt: new Date().toISOString(),
    };

    setBqQueryHistory(prev => [result, ...prev.slice(0, 19)]);
    logAuditAction('bigquery.googleapis.com', 'jobs.query', `projects/${currentProject.projectId}/queries`, 'SUCCESS', `Processed ${bytesProcessed} bytes in ${latency}ms`);
    showToast(`Query completed (${rows.length} rows in ${latency}ms)`);
    return result;
  };

  // Favourites
  const toggleFavourite = (productId: string) => {
    setFavourites(prev =>
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    );
  };

  const isFavourite = (productId: string) => favourites.includes(productId);

  // Cloud Shell Command Runner
  const executeCliCommand = (cmd: string): string[] => {
    const trimmed = cmd.trim();
    if (!trimmed) return [];

    const parts = trimmed.split(/\s+/);
    const primary = parts[0];

    // Logging command execution
    logAuditAction('cloudshell.googleapis.com', 'terminal.execute', trimmed, 'SUCCESS');

    if (primary === 'help' || primary === 'lc' && parts[1] === 'help') {
      return [
        'LocalCloud Interactive CLI (supports standard gcloud & gsutil syntax):',
        '  gcloud projects list                         - List projects in LocalCloud',
        '  gcloud config set project <PROJECT_ID>       - Switch active project',
        '  gcloud config get-value project              - Display active project',
        '  gcloud services list --enabled               - List enabled APIs',
        '  gcloud services enable <API_NAME>            - Enable an API',
        '  gcloud services disable <API_NAME>           - Disable an API',
        '  gcloud billing accounts list                 - List billing accounts and credits',
        '  gcloud iam service-accounts list             - List service accounts',
        '  gcloud compute instances list                - List Compute Engine instances',
        '  gsutil ls                                    - List Cloud Storage buckets',
        '  gsutil ls gs://<bucket>                      - List objects in a bucket',
        '  gsutil mb gs://<bucket>                      - Make (create) a bucket',
        '  gsutil cp <src> gs://<bucket>/<dest>         - Upload file to bucket',
        '  gsutil rm gs://<bucket>/<object>             - Delete an object',
        '  gsutil rm -r gs://<bucket>                   - Delete bucket and all its objects',
        '  gcloud storage buckets list                  - List buckets using gcloud storage',
        '  gcloud storage objects list gs://<bucket>    - List objects using gcloud storage',
        '  clear                                        - Clear terminal output',
        '',
        'Networking lab commands (simulated, no real resources):',
        ...NETLAB_HELP_LINES,
      ];
    }

    if (trimmed === 'clear') {
      return ['__CLEAR__'];
    }

    if (trimmed === 'gcloud projects list') {
      const header = 'PROJECT_ID              NAME                 PROJECT_NUMBER';
      const rows = projects.map(
        p => `${p.projectId.padEnd(24)} ${p.name.padEnd(20)} ${p.projectNumber}`
      );
      return [header, ...rows];
    }

    if (trimmed === 'gcloud config get-value project') {
      return [currentProject.projectId];
    }

    if (trimmed.startsWith('gcloud config set project')) {
      const targetId = parts[4] || parts[3];
      const match = projects.find(p => p.projectId === targetId || p.id === targetId);
      if (match) {
        setCurrentProject(match);
        return [`Updated property [core/project] to [${match.projectId}].`];
      }
      return [`ERROR: Project [${targetId}] not found in LocalCloud emulator.`];
    }

    if (trimmed.startsWith('gcloud services list')) {
      const enabledList = apiServices.filter(a => a.enabled);
      const header = 'NAME                           TITLE';
      const rows = enabledList.map(a => `${a.id.padEnd(30)} ${a.title}`);
      return [header, ...rows];
    }

    if (trimmed.startsWith('gcloud services enable')) {
      const targetApi = parts[3];
      if (!targetApi) return ['ERROR: Missing API name. Usage: gcloud services enable <API_NAME>'];
      const found = apiServices.find(a => a.id === targetApi || a.id.startsWith(targetApi));
      if (found) {
        toggleApi(found.id, true);
        return [`Operation "operations/service-${Date.now()}" finished successfully. Enabled [${found.id}].`];
      }
      return [`ERROR: API [${targetApi}] not recognized in LocalCloud emulator.`];
    }

    if (trimmed.startsWith('gcloud services disable')) {
      const targetApi = parts[3];
      if (!targetApi) return ['ERROR: Missing API name. Usage: gcloud services disable <API_NAME>'];
      const found = apiServices.find(a => a.id === targetApi || a.id.startsWith(targetApi));
      if (found) {
        toggleApi(found.id, false);
        return [`Disabled API [${found.id}].`];
      }
      return [`ERROR: API [${targetApi}] not recognized.`];
    }

    if (trimmed.startsWith('gcloud billing accounts list')) {
      return [
        'ACCOUNT_ID            NAME                 OPEN   VIRTUAL_BALANCE',
        `${billingAccount.accountNumber.padEnd(22)} ${billingAccount.name.padEnd(20)} true   $${billingAccount.virtualBalance.toFixed(2)} USD`,
      ];
    }

    if (trimmed.startsWith('gcloud iam service-accounts list')) {
      const header = 'DISPLAY NAME                               EMAIL';
      const rows = serviceAccounts.map(s => `${s.displayName.padEnd(42)} ${s.email}`);
      return [header, ...rows];
    }

    if (trimmed.startsWith('gcloud compute instances list')) {
      if (!isBillingEnabledForCurrentProject) {
        return ['ERROR: (gcloud.compute.instances.list) Project has no active billing account. Enable billing in console.'];
      }
      if (vmInstances.length === 0) {
        return ['Listed 0 items.'];
      }
      const header = 'NAME                 ZONE           MACHINE_TYPE  INTERNAL_IP    EXTERNAL_IP     STATUS';
      const rows = vmInstances.map(vm =>
        `${vm.name.padEnd(20)} ${vm.zone.padEnd(14)} ${vm.machineType.padEnd(13)} ${(vm.internalIp || 'None').padEnd(14)} ${(vm.externalIp || 'None').padEnd(15)} ${vm.status}`
      );
      return [header, ...rows];
    }

    if (trimmed.startsWith('gcloud compute instances create')) {
      const name = parts[3];
      if (!name) return ['ERROR: Missing instance name. Usage: gcloud compute instances create <NAME>'];
      const zoneArg = parts.find(p => p.startsWith('--zone='));
      const machineArg = parts.find(p => p.startsWith('--machine-type='));
      const zone = zoneArg ? zoneArg.replace('--zone=', '') : 'us-central1-a';
      const machineType = machineArg ? machineArg.replace('--machine-type=', '') : 'e2-micro';

      createVmInstance({ name, zone, machineType });
      return [
        `Created [https://www.googleapis.com/compute/v1/projects/${currentProject.projectId}/zones/${zone}/instances/${name}].`,
        `NAME: ${name}`,
        `ZONE: ${zone}`,
        `MACHINE_TYPE: ${machineType}`,
        `STATUS: PROVISIONING`,
      ];
    }

    if (trimmed.startsWith('gcloud compute instances start')) {
      const name = parts[3];
      const match = vmInstances.find(vm => vm.name === name);
      if (!match) return [`ERROR: Instance [${name}] not found.`];
      startVmInstance(match.id);
      return [`Starting instance(s) ${name}...done.`];
    }

    if (trimmed.startsWith('gcloud compute instances stop')) {
      const name = parts[3];
      const match = vmInstances.find(vm => vm.name === name);
      if (!match) return [`ERROR: Instance [${name}] not found.`];
      stopVmInstance(match.id);
      return [`Stopping instance(s) ${name}...done.`];
    }

    if (trimmed.startsWith('gcloud compute instances delete')) {
      const name = parts[3];
      const match = vmInstances.find(vm => vm.name === name);
      if (!match) return [`ERROR: Instance [${name}] not found.`];
      deleteVmInstance(match.id);
      return [`Deleted [https://www.googleapis.com/compute/v1/projects/${currentProject.projectId}/zones/${match.zone}/instances/${name}].`];
    }

    if (trimmed.startsWith('gcloud compute instances describe')) {
      const name = parts[3];
      const match = vmInstances.find(vm => vm.name === name);
      if (!match) return [`ERROR: Instance [${name}] not found.`];
      return [
        `name: ${match.name}`,
        `id: "${match.id}"`,
        `zone: ${match.zone}`,
        `machineType: ${match.machineType}`,
        `status: ${match.status}`,
        `networkInterfaces:`,
        `  - networkIP: ${match.internalIp}`,
        `    accessConfigs:`,
        `      - natIP: ${match.externalIp}`,
        `disks:`,
        `  - boot: true`,
        `    diskSizeGb: "${match.bootDiskSizeGb}"`,
        `    type: ${match.bootDiskType}`,
      ];
    }

    if (trimmed.startsWith('gcloud compute ssh')) {
      const name = parts[3];
      const match = vmInstances.find(vm => vm.name === name);
      const vmName = match ? match.name : name || 'instance';
      return [
        `Connecting to ${vmName} via SSH...`,
        `Warning: Permanently added '${vmName}' (ED25519) to the list of known hosts.`,
        `Linux ${vmName} 6.1.0-21-cloud-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.90-1`,
        `student@${vmName}:~$ (Simulated SSH connection established. Type 'exit' to disconnect.)`,
      ];
    }

    if (trimmed.startsWith('gcloud compute networks subnets list')) {
      const header = 'NAME                    REGION           NETWORK   RANGE';
      const rows = vpcSubnets.map(s => `${s.name.padEnd(23)} ${s.region.padEnd(16)} ${s.networkName.padEnd(9)} ${s.ipCidrRange}`);
      return [header, ...rows];
    }

    if (trimmed.startsWith('gcloud compute networks list')) {
      const header = 'NAME     SUBNET_MODE  BGP_ROUTING_MODE  IPV4_RANGE  GATEWAY_IPV4';
      const rows = vpcNetworks.map(n => `${n.name.padEnd(8)} AUTO         REGIONAL`);
      return [header, ...rows];
    }

    if (trimmed.startsWith('gcloud compute firewall-rules list')) {
      const header = 'NAME                    NETWORK  DIRECTION  PRIORITY  ALLOW/DENY';
      const rows = firewallRules.map(f => `${f.name.padEnd(23)} ${f.networkName.padEnd(8)} ${f.direction.padEnd(10)} ${String(f.priority).padEnd(9)} ${f.protocolsAndPorts}`);
      return [header, ...rows];
    }

    if (trimmed.startsWith('gsutil ls')) {
      const target = parts[1] === '-r' ? parts[2] : parts[1];
      if (!target) {
        // List all buckets
        return buckets.map(b => `gs://${b.name}/`);
      }
      const cleanTarget = target.replace('gs://', '').replace(/\/$/, '');
      const bMatches = buckets.find(b => b.name === cleanTarget);
      if (!bMatches) {
        return [`BucketNotFoundException: 404 gs://${cleanTarget} bucket does not exist.`];
      }
      const bObjects = objects.filter(o => o.bucketName === cleanTarget || o.bucketId === bMatches.id);
      if (bObjects.length === 0) {
        return [`(gs://${cleanTarget} is empty)`];
      }
      return bObjects.map(o => `gs://${cleanTarget}/${o.name}`);
    }

    if (trimmed.startsWith('gsutil mb')) {
      const bucketUrl = parts.find(p => p.startsWith('gs://'));
      if (!bucketUrl) return ['ERROR: CommandException: "mb" requires a bucket name (gs://<bucket>).'];
      const bucketName = bucketUrl.replace('gs://', '').replace(/\/$/, '');
      if (buckets.some(b => b.name === bucketName)) {
        return [`ERROR: 409 Bucket ${bucketName} already exists.`];
      }
      createBucket({ name: bucketName });
      return [`Creating gs://${bucketName}/...`, `Success: Bucket created.`];
    }

    if (trimmed.startsWith('gsutil cp')) {
      const destUrl = parts[parts.length - 1];
      const src = parts[2];
      if (!destUrl.startsWith('gs://')) {
        return ['ERROR: Destination must be a Cloud Storage URI (gs://<bucket>/...)'];
      }
      const pathParts = destUrl.replace('gs://', '').split('/');
      const bName = pathParts[0];
      const targetObjName = pathParts.slice(1).join('/') || src.split('/').pop() || 'uploaded-file.txt';
      uploadObject(bName, targetObjName, {
        name: targetObjName,
        size: 1540,
        type: 'text/plain',
        content: `Uploaded via gsutil cp from local file "${src}" at ${new Date().toISOString()}`,
      });
      return [`Copying ${src} [Content-Type=text/plain]...`, `\Operation completed over 1 objects/1.5 KiB.`];
    }

    if (trimmed.startsWith('gsutil rm')) {
      const isRecursive = parts.includes('-r');
      const targetUrl = parts.find(p => p.startsWith('gs://'));
      if (!targetUrl) return ['ERROR: Missing target URI'];
      const rawPath = targetUrl.replace('gs://', '');
      if (!rawPath.includes('/')) {
        // Target is bucket
        if (!isRecursive) {
          return [`ERROR: Bucket is not empty. Use -r to delete recursively: gsutil rm -r gs://${rawPath}`];
        }
        deleteBucket(rawPath);
        return [`Removing gs://${rawPath}/...`];
      } else {
        const [bName, ...oParts] = rawPath.split('/');
        const objName = oParts.join('/');
        const match = objects.find(o => (o.bucketName === bName || o.bucketId === bName) && o.name === objName);
        if (match) {
          deleteObject(match.id);
          return [`Removing gs://${rawPath}...`];
        }
        return [`No URLs matched: gs://${rawPath}`];
      }
    }

    if (trimmed.startsWith('gcloud storage buckets list')) {
      const header = 'BUCKET_NAME                    LOCATION     STORAGE_CLASS';
      const rows = buckets.map(b => `${('gs://' + b.name).padEnd(30)} ${b.location.padEnd(12)} ${b.storageClass}`);
      return [header, ...rows];
    }

    if (trimmed.startsWith('gcloud storage objects list')) {
      const bucketUrl = parts[4];
      if (!bucketUrl) return ['ERROR: Usage: gcloud storage objects list gs://<bucket>'];
      const cleanB = bucketUrl.replace('gs://', '').replace(/\/$/, '');
      const bObjects = objects.filter(o => o.bucketName === cleanB);
      const header = 'OBJECT_NAME                                 SIZE     UPDATED';
      const rows = bObjects.map(o => `${o.name.padEnd(42)} ${String(o.size).padEnd(8)} ${new Date(o.updatedAt).toLocaleDateString()}`);
      return [header, ...rows];
    }

    // Phase 5: Pub/Sub CLI Commands
    if (trimmed.startsWith('gcloud pubsub topics list')) {
      const header = 'TOPIC_NAME';
      const rows = pubsubTopics.map(t => `projects/${currentProject.projectId}/topics/${t.name}`);
      return [header, ...rows];
    }

    if (trimmed.startsWith('gcloud pubsub topics create')) {
      const topicName = parts[4];
      if (!topicName) return ['ERROR: Missing topic name. Usage: gcloud pubsub topics create <NAME>'];
      createPubsubTopic(topicName);
      return [`Created topic [projects/${currentProject.projectId}/topics/${topicName}].`];
    }

    if (trimmed.startsWith('gcloud pubsub topics delete')) {
      const topicName = parts[4];
      if (!topicName) return ['ERROR: Missing topic name. Usage: gcloud pubsub topics delete <NAME>'];
      deletePubsubTopic(topicName);
      return [`Deleted topic [projects/${currentProject.projectId}/topics/${topicName}].`];
    }

    if (trimmed.startsWith('gcloud pubsub topics publish')) {
      const topicName = parts[4];
      if (!topicName) return ['ERROR: Missing topic name. Usage: gcloud pubsub topics publish <TOPIC> --message="..."'];
      const msgArg = parts.slice(5).join(' ');
      const messageMatch = msgArg.match(/--message=["']?(.*?)["']?$/);
      const message = messageMatch ? messageMatch[1] : 'Sample published message';
      const published = publishPubsubMessage(topicName, message);
      return [`messageIds:`, `- '${published.id}'`];
    }

    if (trimmed.startsWith('gcloud pubsub subscriptions list')) {
      const header = 'SUBSCRIPTION_NAME                                 TOPIC_NAME';
      const rows = pubsubSubscriptions.map(s => `${s.name.padEnd(48)} ${s.topicName}`);
      return [header, ...rows];
    }

    if (trimmed.startsWith('gcloud pubsub subscriptions create')) {
      const subName = parts[4];
      if (!subName) return ['ERROR: Missing subscription name. Usage: gcloud pubsub subscriptions create <NAME> --topic=<TOPIC>'];
      const topicArg = parts.find(p => p.startsWith('--topic='));
      const topicName = topicArg ? topicArg.replace('--topic=', '') : 'order-events';
      createPubsubSubscription({ name: subName, topicName });
      return [`Created subscription [projects/${currentProject.projectId}/subscriptions/${subName}].`];
    }

    if (trimmed.startsWith('gcloud pubsub subscriptions pull')) {
      const subName = parts[4];
      if (!subName) return ['ERROR: Missing subscription name. Usage: gcloud pubsub subscriptions pull <NAME>'];
      const pulled = pullPubsubMessages(subName, 5);
      if (pulled.length === 0) return ['Listed 0 items (no unacknowledged messages in queue).'];
      const autoAck = parts.includes('--auto-ack');
      const lines = ['DATA                                                  MESSAGE_ID    ATTRIBUTES'];
      pulled.forEach(p => {
        lines.push(`${p.message.data.slice(0, 52).padEnd(54)} ${p.message.id.padEnd(14)} ${JSON.stringify(p.message.attributes)}`);
        if (autoAck) ackPubsubMessage(subName, p.ackId);
      });
      return lines;
    }

    // Phase 5: Cloud Run CLI Commands
    if (trimmed.startsWith('gcloud run services list')) {
      const header = 'SERVICE           REGION       URL                                           STATUS';
      const rows = runServices.map(s => `${s.name.padEnd(17)} ${s.region.padEnd(12)} ${s.url.padEnd(45)} ${s.status}`);
      return [header, ...rows];
    }

    if (trimmed.startsWith('gcloud run deploy')) {
      const serviceName = parts[3];
      if (!serviceName) return ['ERROR: Missing service name. Usage: gcloud run deploy <SERVICE> [--image=...]'];
      const imageArg = parts.find(p => p.startsWith('--image='));
      const image = imageArg ? imageArg.replace('--image=', '') : 'gcr.io/google-samples/hello-app:1.0';
      const s = deployRunService({ name: serviceName, initialRevision: { image } });
      return [
        `Deploying container to Cloud Run service [${serviceName}] in project [${currentProject.projectId}] region [${s.region}]...`,
        `✓ Deploying... Done.`,
        `✓ Creating Revision...`,
        `✓ Routing traffic...`,
        `Done.`,
        `Service [${serviceName}] revision [${s.latestRevisionName}] has been deployed and is serving 100 percent of traffic.`,
        `Service URL: ${s.url}`,
      ];
    }

    if (trimmed.startsWith('gcloud run services describe')) {
      const serviceName = parts[4] || parts[3];
      const match = runServices.find(s => s.name === serviceName);
      if (!match) return [`ERROR: Service [${serviceName}] not found.`];
      return [
        `✔ Service ${match.name} in region ${match.region}`,
        `URL: ${match.url}`,
        `Status: ${match.status}`,
        `Traffic: 100% ${match.latestRevisionName}`,
        `Active Instances: ${match.activeInstances}`,
      ];
    }

    if (trimmed.startsWith('gcloud run services delete')) {
      const serviceName = parts[4] || parts[3];
      const match = runServices.find(s => s.name === serviceName);
      if (!match) return [`ERROR: Service [${serviceName}] not found.`];
      deleteRunService(match.id);
      return [`Deleted service [${serviceName}].`];
    }

    // Phase 6: Secret Manager CLI Commands
    if (trimmed.startsWith('gcloud secrets list')) {
      const header = 'NAME                           CREATED              LOCATIONS';
      const rows = secrets.map(s => `${s.name.padEnd(30)} ${new Date(s.createdAt).toISOString().slice(0, 10)}           automatic`);
      return [header, ...rows];
    }

    if (trimmed.startsWith('gcloud secrets create')) {
      const secName = parts[3];
      if (!secName) return ['ERROR: Missing secret name. Usage: gcloud secrets create <NAME>'];
      createSecret(secName, 'initial-secret-value');
      return [`Created secret [${secName}].`];
    }

    if (trimmed.startsWith('gcloud secrets versions access')) {
      const secArg = parts.find(p => p.startsWith('--secret='));
      const secName = secArg ? secArg.replace('--secret=', '') : parts[parts.length - 1];
      const match = secrets.find(s => s.name === secName);
      if (!match || match.versions.length === 0) return [`ERROR: Secret [${secName}] not found or has no active versions.`];
      return [match.versions[0].payload];
    }

    // Phase 6: BigQuery CLI Commands
    if (trimmed.startsWith('bq ls')) {
      const header = 'datasetId';
      const rows = bqDatasets.map(d => `${currentProject.projectId}:${d.name}`);
      return [header, ...rows];
    }

    if (trimmed.startsWith('bq query')) {
      const sqlMatch = trimmed.match(/["'](.*?)["']$/);
      const sql = sqlMatch ? sqlMatch[1] : 'SELECT * FROM `billing_export.gcp_billing_export_v1` LIMIT 5';
      const result = executeBigQuery(sql);
      const header = result.columns.join(' | ');
      const rows = result.rows.map(r => r.join(' | '));
      return [
        `Waiting on query job...`,
        `Current status: DONE`,
        `+-------------------------------------------------+`,
        header,
        `+-------------------------------------------------+`,
        ...rows,
        `+-------------------------------------------------+`,
        `Processed ${result.bytesProcessed} bytes in ${result.executionTimeMs}ms.`,
      ];
    }

    return [
      `Command not found or unsupported in LocalCloud CLI: "${trimmed}"`,
      'Type "help" for a list of supported gcloud emulator commands.',
    ];
  };

  return (
    <LocalCloudContext.Provider
      value={{
        currentProject,
        projects,
        setCurrentProject,
        createProject,
        billingAccount,
        isBillingEnabledForCurrentProject,
        linkProjectBilling,
        updateVirtualBalance,
        members,
        addMember,
        updateMemberRoles,
        removeMember,
        serviceAccounts,
        createServiceAccount,
        deleteServiceAccount,
        apiServices,
        toggleApi,
        isApiEnabled,
        buckets,
        objects,
        selectedBucket,
        setSelectedBucket,
        currentFolderPrefix,
        setCurrentFolderPrefix,
        createBucket,
        deleteBucket,
        updateBucket,
        uploadObject,
        deleteObject,
        addLifecycleRule,
        deleteLifecycleRule,
        addBucketIamMember,
        removeBucketIamMember,
        vmInstances,
        selectedVm,
        setSelectedVm,
        createVmInstance,
        startVmInstance,
        stopVmInstance,
        resetVmInstance,
        deleteVmInstance,
        connectSshToVm,
        vpcNetworks,
        vpcSubnets,
        firewallRules,
        createFirewallRule,
        deleteFirewallRule,
        isDockerBackendEnabled,
        setIsDockerBackendEnabled,
        pubsubTopics,
        pubsubSubscriptions,
        pubsubMessages,
        deadLetterMessages,
        selectedTopic,
        setSelectedTopic,
        selectedSubscription,
        setSelectedSubscription,
        createPubsubTopic,
        deletePubsubTopic,
        createPubsubSubscription,
        deletePubsubSubscription,
        publishPubsubMessage,
        pullPubsubMessages,
        ackPubsubMessage,
        nackPubsubMessage,
        runServices,
        runLogs,
        selectedRunService,
        setSelectedRunService,
        deployRunService,
        deleteRunService,
        invokeRunService,
        secrets,
        selectedSecret,
        setSelectedSecret,
        createSecret,
        deleteSecret,
        addSecretVersion,
        destroySecretVersion,
        bqDatasets,
        selectedBqDataset,
        setSelectedBqDataset,
        selectedBqTable,
        setSelectedBqTable,
        bqQueryHistory,
        executeBigQuery,
        activeView,
        setActiveView,
        recentVisits,
        favourites,
        toggleFavourite,
        isFavourite,
        isNavDrawerOpen,
        setIsNavDrawerOpen,
        isCloudShellOpen,
        setIsCloudShellOpen,
        isAssistantOpen,
        setIsAssistantOpen,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        isProjectPickerOpen,
        setIsProjectPickerOpen,
        isDarkMode,
        toggleTheme,
        auditLogs,
        logAuditAction,
        executeCliCommand,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </LocalCloudContext.Provider>
  );
};

export const useLocalCloud = () => {
  const context = useContext(LocalCloudContext);
  if (!context) {
    throw new Error('useLocalCloud must be used within a LocalCloudProvider');
  }
  return context;
};
