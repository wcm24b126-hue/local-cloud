/**
 * NetLab store: React state wrapper around the pure simulation engine.
 *
 * Responsibilities:
 *  - own the SimState
 *  - run mutations through the engine and surface typed errors as toasts
 *  - animate lifecycle transitions (PROVISIONING -> RUNNING) with timers scaled
 *    by SIMULATION_SPEED, never blocking the UI thread
 *  - persist through the adapter pattern
 *
 * The engine itself stays pure; all asynchrony lives here.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  addRule,
  attachDisk,
  attachInternetGateway,
  attachNsg,
  createDisk,
  createInstanceGroup,
  createInstanceTemplate,
  createSnapshot,
  createInitialState,
  createLoadBalancer,
  createNsg,
  resizeInstanceGroup,
  createRoute,
  createSubnet,
  createVm,
  createVpc,
  deleteDisk,
  deleteInstanceGroup,
  deleteInstanceTemplate,
  deleteSnapshot,
  deleteLoadBalancer,
  deleteNsg,
  deleteRoute,
  deleteRule,
  deleteSubnet,
  deleteVm,
  deleteVpc,
  detachDisk,
  detachNsg,
  detachInternetGateway,
  setLoadBalancerBackends,
  setVmRunning,
} from '../sim/engine';
import { isNetlabCommand, runNetlabCommand } from '../sim/cli';
import { DELAYS, getSpeed, simulateDelay } from '../sim/env';
import { evaluatePacket } from '../sim/packetTracer';
import { buildThreeTierErp } from '../sim/referenceArchitecture';
import {
  createK8sAutoscaler as createK8sAutoscalerEngine,
  createK8sCluster as createK8sClusterEngine,
  createK8sConfigMap as createK8sConfigMapEngine,
  createK8sDeployment as createK8sDeploymentEngine,
  createK8sGateway as createK8sGatewayEngine,
  createK8sIngress as createK8sIngressEngine,
  createK8sNamespace as createK8sNamespaceEngine,
  createK8sPvc as createK8sPvcEngine,
  createK8sSecret as createK8sSecretEngine,
  createK8sService as createK8sServiceEngine,
  deleteK8sCluster as deleteK8sClusterEngine,
  deleteK8sDeployment as deleteK8sDeploymentEngine,
  deleteK8sGateway as deleteK8sGatewayEngine,
  deleteK8sService as deleteK8sServiceEngine,
  reconcileK8sAutoscaler as reconcileK8sAutoscalerEngine,
  resizeK8sCluster as resizeK8sClusterEngine,
  scaleK8sDeployment as scaleK8sDeploymentEngine,
  updateK8sDeploymentImage as updateK8sDeploymentImageEngine,
} from '../sim/k8s';
import {
  buildKubernetesErp,
  loadTestErp,
  removeAllClusters as removeAllK8sClusters,
  resizeErpCluster as resizeErpClusterEngine,
  scaleErpTier as scaleErpTierEngine,
} from '../sim/kubernetesErp';
import {
  createSqlInstance as createSqlInstanceEngine,
  createSqlDatabase as createSqlDatabaseEngine,
  createSqlUser as createSqlUserEngine,
  createBackup as createSqlBackupEngine,
  deleteBackup as deleteSqlBackupEngine,
  deleteSqlInstance as deleteSqlInstanceEngine,
  deleteSqlDatabase as deleteSqlDatabaseEngine,
  deleteSqlUser as deleteSqlUserEngine,
  restartSqlInstance as restartSqlInstanceEngine,
  stopSqlInstance as stopSqlInstanceEngine,
  setDeletionProtection as setSqlDeletionProtectionEngine,
  setPointInTimeRecovery as setSqlPitrEngine,
} from '../sim/cloudSql';
import {
  createKeyRing as createKeyRingEngine,
  deleteKeyRing as deleteKeyRingEngine,
  createKey as createKmsKeyEngine,
  setKeyEnabled as setKmsKeyEnabledEngine,
  destroyKey as destroyKmsKeyEngine,
  cancelDestruction as cancelKmsDestructionEngine,
  addKeyVersion as addKmsKeyVersionEngine,
  setPrimaryVersion as setKmsPrimaryVersionEngine,
} from '../sim/kms';
import {
  createAlertPolicy as createAlertPolicyEngine,
  setPolicyEnabled as setAlertPolicyEnabledEngine,
  deleteAlertPolicy as deleteAlertPolicyEngine,
  createUptimeCheck as createUptimeCheckEngine,
  runUptimeCheck as runUptimeCheckEngine,
  deleteUptimeCheck as deleteUptimeCheckEngine,
} from '../sim/monitoring';
import { normalizeSimState } from '../sim/engine';
import { buildSampleNetwork } from '../sim/seed';
import { K8sGateway, Packet, SimResult, SimState, TraceRecord } from '../sim/types';
import { createPersistenceAdapter, LocalStorageAdapter } from './persistence';
import { PersistenceAdapter } from './persistence/types';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
  detail?: string;
}

export interface PendingResource {
  kind: string;
  name: string;
  phase: string;
}

interface NetLabContextValue {
  state: SimState;
  toasts: Toast[];
  pending: PendingResource[];
  isLoading: boolean;
  isTracing: boolean;
  currentTrace: TraceRecord | null;
  storageAdapterName: string;
  speed: number;
  labProgress: Record<string, boolean>;
  guidedLabOpen: boolean;
  activeSection: string;

  setActiveSection: (section: string) => void;
  setGuidedLabOpen: (open: boolean) => void;
  dismissToast: (id: number) => void;
  notify: (kind: Toast['kind'], message: string, detail?: string) => void;
  markLabStep: (stepId: string, done: boolean) => void;

  // VPC
  createVpcNetwork: (name: string, routingMode?: 'regional' | 'global') => Promise<boolean>;
  removeVpc: (id: string, cascade?: boolean) => Promise<boolean>;

  // Subnets
  createSubnetResource: (input: {
    name: string;
    vpcId: string;
    cidr: string;
    region?: string;
    allowPublicRange?: boolean;
  }) => Promise<boolean>;
  removeSubnet: (id: string, cascade?: boolean) => Promise<boolean>;

  // VMs
  createVmResource: (input: {
    name: string;
    subnetId: string;
    zone?: string;
    machineType?: string;
    withExternalIp?: boolean;
    networkTags?: string[];
  }) => Promise<boolean>;
  changeVmPower: (id: string, running: boolean) => Promise<boolean>;
  removeVm: (id: string) => Promise<boolean>;

  // Disks
  createDiskResource: (input: {
    name: string;
    zone?: string;
    sizeGb?: number;
    type?: 'pd-standard' | 'pd-balanced' | 'pd-ssd';
  }) => Promise<boolean>;
  attachDiskToVm: (diskId: string, vmId: string) => Promise<boolean>;
  detachDiskFromVm: (diskId: string) => Promise<boolean>;
  removeDisk: (id: string) => Promise<boolean>;

  // Snapshots
  createSnapshotResource: (input: { name: string; diskId: string; storageClass?: 'STANDARD' | 'NEARLINE' | 'COLDLINE' | 'ARCHIVE' }) => Promise<boolean>;
  removeSnapshot: (id: string) => Promise<boolean>;

  // Instance templates and managed instance groups
  createTemplateResource: (input: {
    name: string;
    subnetId: string;
    zone?: string;
    machineType?: string;
    networkTags?: string[];
    bootDiskSizeGb?: number;
    withExternalIp?: boolean;
  }) => Promise<boolean>;
  removeTemplate: (id: string) => Promise<boolean>;
  createGroupResource: (input: {
    name: string;
    templateId: string;
    targetSize?: number;
    minSize?: number;
    maxSize?: number;
  }) => Promise<boolean>;
  resizeGroup: (id: string, targetSize: number) => Promise<boolean>;
  removeGroup: (id: string) => Promise<boolean>;

  // Gateway and routes
  attachGateway: (name: string, vpcId: string) => Promise<boolean>;
  detachGateway: (id: string) => Promise<boolean>;
  createRouteResource: (input: {
    name: string;
    vpcId: string;
    destCidr: string;
    nextHop: 'local' | 'internet-gateway' | 'vm';
    nextHopRefId?: string;
    priority?: number;
  }) => Promise<boolean>;
  removeRoute: (id: string) => Promise<boolean>;

  // Load balancer
  createLoadBalancerResource: (input: {
    name: string;
    type: 'external-http' | 'internal-tcp';
    vpcId: string;
    port: number;
    protocol?: 'tcp' | 'http';
    backendVmIds?: string[];
  }) => Promise<boolean>;
  setLbBackends: (lbId: string, backendVmIds: string[]) => Promise<boolean>;
  removeLoadBalancer: (id: string) => Promise<boolean>;

  // Firewall policy (NSG)
  createNsgResource: (name: string, vpcId: string) => Promise<boolean>;
  addRuleToNsg: (
    nsgId: string,
    rule: {
      name: string;
      direction: 'ingress' | 'egress';
      action: 'allow' | 'deny';
      priority: number;
      protocol: 'tcp' | 'udp' | 'icmp' | 'all';
      portRange: string | null;
      sourceCidr: string;
      destCidr: string;
      description: string;
    }
  ) => Promise<boolean>;
  removeRuleFromNsg: (nsgId: string, ruleId: string) => Promise<boolean>;
  attachNsgToTargets: (nsgId: string, targets: { vmIds?: string[]; subnetIds?: string[] }) => Promise<boolean>;
  detachNsgFromTargets: (nsgId: string, targets: { vmIds?: string[]; subnetIds?: string[] }) => Promise<boolean>;
  removeNsg: (id: string, cascade?: boolean) => Promise<boolean>;

  // Packet tracer
  sendPacket: (packet: Packet) => Promise<TraceRecord | null>;
  clearTraces: () => void;

  // Lab management
  loadSample: () => void;
  /**
   * Replace the lab with the one-click three-tier ERP reference architecture.
   * Useful for teaching tiered networking without building 40 resources by hand.
   */
  loadErpArchitecture: () => void;
  resetLab: () => void;

  /* ---------------------------------------------------------------- */
  /* Kubernetes                                                        */
  /* ---------------------------------------------------------------- */

  /** One-click three-tier ERP on GKE: 3 replicas per tier, LBs and gateways. */
  loadKubernetesErp: (options?: { clusterName?: string; replicas?: number; nodeCount?: number }) => void;
  /** Remove every cluster and its workloads, keeping the lab network. */
  clearKubernetes: () => void;
  /** Drive every autoscaler once, as a CPU spike would. */
  loadTestKubernetes: () => void;

  createKubernetesCluster: (input: {
    name: string;
    vpcId: string;
    subnetId: string;
    region?: string;
    machineType?: string;
    version?: string;
    nodeCount?: number;
    minNodeCount?: number;
    maxNodeCount?: number;
  }) => Promise<boolean>;
  resizeKubernetesCluster: (clusterId: string, nodeCount: number) => Promise<boolean>;
  removeKubernetesCluster: (clusterId: string, cascade?: boolean) => Promise<boolean>;

  createKubernetesNamespace: (input: { name: string; clusterId: string }) => Promise<boolean>;
  createKubernetesDeployment: (input: {
    name: string;
    namespaceId: string;
    replicas?: number;
    image: string;
    containerPort: number;
    labels?: Record<string, string>;
    env?: Record<string, string>;
    pvcId?: string;
  }) => Promise<boolean>;
  scaleKubernetesDeployment: (deploymentId: string, replicas: number) => Promise<boolean>;
  updateKubernetesImage: (deploymentId: string, image: string) => Promise<boolean>;
  removeKubernetesDeployment: (deploymentId: string, cascade?: boolean) => Promise<boolean>;

  createKubernetesService: (input: {
    name: string;
    namespaceId: string;
    selector: Record<string, string>;
    port: number;
    targetPort: number;
    type?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  }) => Promise<boolean>;
  removeKubernetesService: (serviceId: string, cascade?: boolean) => Promise<boolean>;

  createKubernetesIngress: (input: {
    name: string;
    namespaceId: string;
    host: string;
    path: string;
    serviceId: string;
    servicePort?: number;
  }) => Promise<boolean>;
  createKubernetesGateway: (input: {
    name: string;
    namespaceId: string;
    serviceId: string;
    port: number;
    className?: K8sGateway['className'];
  }) => Promise<boolean>;
  removeKubernetesGateway: (gatewayId: string) => Promise<boolean>;

  createKubernetesConfigMap: (input: {
    name: string;
    namespaceId: string;
    data: Record<string, string>;
  }) => Promise<boolean>;
  createKubernetesSecret: (input: {
    name: string;
    namespaceId: string;
    data: Record<string, string>;
  }) => Promise<boolean>;
  createKubernetesPvc: (input: {
    name: string;
    namespaceId: string;
    storageGb?: number;
  }) => Promise<boolean>;

  createKubernetesAutoscaler: (input: {
    name: string;
    namespaceId: string;
    deploymentId: string;
    minReplicas: number;
    maxReplicas: number;
    targetCpuUtilization: number;
  }) => Promise<boolean>;
  reconcileKubernetesAutoscaler: (autoscalerId: string) => Promise<boolean>;

  /**
   * Run a simulated gcloud command against the lab. Returns the lines the shell
   * should print. Mutations are committed through the same engine the UI uses, so
   * the CLI and the UI can never diverge.
   */
  /* Cloud SQL and AlloyDB. */
  createSqlInstance: (input: Parameters<typeof createSqlInstanceEngine>[1]) => Promise<boolean>;
  restartSqlInstance: (id: string) => Promise<boolean>;
  stopSqlInstance: (id: string) => Promise<boolean>;
  setSqlDeletionProtection: (id: string, enabled: boolean) => Promise<boolean>;
  setSqlPointInTimeRecovery: (id: string, enabled: boolean) => Promise<boolean>;
  deleteSqlInstance: (id: string, cascade?: boolean) => Promise<boolean>;
  createSqlDatabase: (input: { instanceId: string; name: string }) => Promise<boolean>;
  deleteSqlDatabase: (id: string) => Promise<boolean>;
  createSqlUser: (input: { instanceId: string; name: string; password: string; type?: 'BUILT_IN' | 'CLOUD_IAM_SERVICE_ACCOUNT' }) => Promise<boolean>;
  deleteSqlUser: (id: string) => Promise<boolean>;
  createSqlBackup: (input: { instanceId: string; type?: 'ON_DEMAND' | 'AUTOMATED' }) => Promise<boolean>;
  deleteSqlBackup: (id: string) => Promise<boolean>;

  /* Cloud KMS. */
  createKmsKeyRing: (input: { name: string; location: string }) => Promise<boolean>;
  deleteKmsKeyRing: (id: string, cascade?: boolean) => Promise<boolean>;
  createKmsKey: (input: Parameters<typeof createKmsKeyEngine>[1]) => Promise<boolean>;
  setKmsKeyEnabled: (id: string, enabled: boolean) => Promise<boolean>;
  destroyKmsKey: (id: string) => Promise<boolean>;
  cancelKmsDestruction: (id: string) => Promise<boolean>;
  addKmsKeyVersion: (id: string) => Promise<boolean>;
  setKmsPrimaryVersion: (keyId: string, versionId: string) => Promise<boolean>;

  /* Cloud Monitoring. */
  createAlertPolicy: (input: Parameters<typeof createAlertPolicyEngine>[1]) => Promise<boolean>;
  setAlertPolicyEnabled: (id: string, enabled: boolean) => Promise<boolean>;
  deleteAlertPolicy: (id: string) => Promise<boolean>;
  createUptimeCheck: (input: Parameters<typeof createUptimeCheckEngine>[1]) => Promise<boolean>;
  runUptimeCheck: (id: string) => Promise<boolean>;
  deleteUptimeCheck: (id: string) => Promise<boolean>;

  runShellCommand: (command: string) => string[];
  exportLab: () => string;
  importLab: (raw: string) => boolean;
}

const NetLabContext = createContext<NetLabContextValue | null>(null);

let toastCounter = 0;

export const NetLabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SimState>(() => createInitialState());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<PendingResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTracing, setIsTracing] = useState(false);
  const [currentTrace, setCurrentTrace] = useState<TraceRecord | null>(null);
  const [labProgress, setLabProgress] = useState<Record<string, boolean>>({});
  const [guidedLabOpen, setGuidedLabOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('netlab-overview');

  // Resolved asynchronously: the server decides whether Postgres is available.
  // Until that resolves we fall back to the localStorage adapter, which always
  // works, and swap in the mirrored adapter once the probe finishes.
  const [adapter, setAdapter] = useState<PersistenceAdapter>(() => new LocalStorageAdapter());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (kind: Toast['kind'], message: string, detail?: string) => {
      toastCounter += 1;
      const id = toastCounter;
      setToasts((prev) => [...prev.slice(-3), { id, kind, message, detail }]);
      setTimeout(() => dismissToast(id), kind === 'error' ? 9000 : 4500);
    },
    [dismissToast]
  );

  const markLabStep = useCallback((stepId: string, done: boolean) => {
    setLabProgress((prev) => ({ ...prev, [stepId]: done }));
  }, []);

  /**
   * Resolve the adapter, then load the persisted lab. Both steps are
   * best-effort: on any failure the lab starts empty rather than breaking.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let resolved: PersistenceAdapter = new LocalStorageAdapter();
      try {
        resolved = await createPersistenceAdapter();
      } catch {
        // Keep the localStorage adapter.
      }
      if (cancelled) return;
      setAdapter(resolved);

      try {
        const loaded = await resolved.load();
        // Normalize on the way in: a lab saved before Kubernetes existed has no
        // k8s collections, and every page would otherwise crash on undefined.
        if (!cancelled && loaded) setState(normalizeSimState(loaded));
      } catch {
        // Persistence is best-effort; the lab still runs from an empty state.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Debounced auto-save whenever the lab changes. */
  useEffect(() => {
    if (isLoading) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void adapter.save(state);
    }, 400);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, isLoading]);

  /**
   * Run one engine mutation, animate the lifecycle if it is slow, and report the
   * result. Returns true when the mutation succeeded.
   */
  const runMutation = useCallback(
    async (
      action: (current: SimState) => SimResult<{ state: SimState }>,
      options: { delayMs?: number; pendingLabel?: string } = {}
    ): Promise<boolean> => {
      let next: SimState;
      let message: string;

      try {
        const result = action(state);
        if (!result.ok) {
          notify('error', result.message, result.howToFix);
          return false;
        }
        next = result.value.state;
        message = result.message;
      } catch (error) {
        notify('error', 'The simulation engine threw an unexpected error.', String(error));
        return false;
      }

      // Intermediate lifecycle phase so the learner sees it animate.
      const { delayMs = 0, pendingLabel } = options;
      if (pendingLabel && delayMs > 0) {
        setPending((prev) => [...prev, { kind: pendingLabel, name: '', phase: 'PROVISIONING' }]);
      }

      if (delayMs > 0) {
        // Show the pending state, wait with a scaled delay, then commit.
        await simulateDelay(delayMs);
        if (pendingLabel) setPending((prev) => prev.slice(0, -1));
      }

      setState(next);
      notify('success', message);
      return true;
    },
    [notify, state]
  );

  /* ---------------------------------------------------------------- */
  /* VPC                                                              */
  /* ---------------------------------------------------------------- */

  const createVpcNetwork = useCallback(
    async (name: string, routingMode: 'regional' | 'global' = 'regional') =>
      runMutation((s) => createVpc(s, { name, routingMode }), {
        delayMs: DELAYS.resourceCreate,
        pendingLabel: 'VPC network',
      }),
    [runMutation]
  );

  const removeVpc = useCallback(
    async (id: string, cascade = false) =>
      runMutation((s) => deleteVpc(s, id, { cascade }), { delayMs: cascade ? DELAYS.delete * 2 : DELAYS.delete }),
    [runMutation]
  );

  /* ---------------------------------------------------------------- */
  /* Subnets                                                          */
  /* ---------------------------------------------------------------- */

  const createSubnetResource = useCallback(
    async (input: Parameters<typeof createSubnet>[1]) =>
      runMutation((s) => createSubnet(s, input), { delayMs: DELAYS.resourceCreate, pendingLabel: 'Subnet' }),
    [runMutation]
  );

  const removeSubnet = useCallback(
    async (id: string, cascade = false) =>
      runMutation((s) => deleteSubnet(s, id, { cascade }), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  /* ---------------------------------------------------------------- */
  /* VMs                                                              */
  /* ---------------------------------------------------------------- */

  const createVmResource = useCallback(
    async (input: Parameters<typeof createVm>[1]) =>
      runMutation((s) => createVm(s, input), { delayMs: DELAYS.vmProvision, pendingLabel: 'VM instance' }),
    [runMutation]
  );

  const changeVmPower = useCallback(
    async (id: string, running: boolean) =>
      runMutation((s) => setVmRunning(s, id, running), { delayMs: DELAYS.attach }),
    [runMutation]
  );

  const removeVm = useCallback(
    async (id: string) => runMutation((s) => deleteVm(s, id), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  /* ---------------------------------------------------------------- */
  /* Disks                                                            */
  /* ---------------------------------------------------------------- */

  const createDiskResource = useCallback(
    async (input: Parameters<typeof createDisk>[1]) =>
      runMutation((s) => createDisk(s, input), { delayMs: DELAYS.resourceCreate, pendingLabel: 'Disk' }),
    [runMutation]
  );

  const attachDiskToVm = useCallback(
    async (diskId: string, vmId: string) =>
      runMutation((s) => attachDisk(s, diskId, vmId), { delayMs: DELAYS.attach }),
    [runMutation]
  );

  const detachDiskFromVm = useCallback(
    async (diskId: string) => runMutation((s) => detachDisk(s, diskId), { delayMs: DELAYS.attach }),
    [runMutation]
  );

  const removeDisk = useCallback(
    async (id: string) => runMutation((s) => deleteDisk(s, id), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  /* ---------------------------------------------------------------- */
  /* Snapshots, templates and managed instance groups                 */
  /* ---------------------------------------------------------------- */

  const createSnapshotResource = useCallback(
    async (input: Parameters<typeof createSnapshot>[1]) =>
      runMutation((s) => createSnapshot(s, input), { delayMs: DELAYS.resourceCreate, pendingLabel: 'Snapshot' }),
    [runMutation]
  );

  const removeSnapshot = useCallback(
    async (id: string) => runMutation((s) => deleteSnapshot(s, id), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  const createTemplateResource = useCallback(
    async (input: Parameters<typeof createInstanceTemplate>[1]) =>
      runMutation((s) => createInstanceTemplate(s, input), { delayMs: DELAYS.resourceCreate, pendingLabel: 'Instance template' }),
    [runMutation]
  );

  const removeTemplate = useCallback(
    async (id: string) => runMutation((s) => deleteInstanceTemplate(s, id), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  const createGroupResource = useCallback(
    async (input: Parameters<typeof createInstanceGroup>[1]) =>
      runMutation((s) => createInstanceGroup(s, input), { delayMs: DELAYS.resourceCreate, pendingLabel: 'Instance group' }),
    [runMutation]
  );

  const resizeGroup = useCallback(
    async (id: string, targetSize: number) =>
      runMutation((s) => resizeInstanceGroup(s, id, targetSize), { delayMs: DELAYS.attach }),
    [runMutation]
  );

  const removeGroup = useCallback(
    async (id: string) => runMutation((s) => deleteInstanceGroup(s, id), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  /* ---------------------------------------------------------------- */
  /* Gateway and routes                                               */
  /* ---------------------------------------------------------------- */

  const attachGateway = useCallback(
    async (name: string, vpcId: string) =>
      runMutation((s) => attachInternetGateway(s, { name, vpcId }), {
        delayMs: DELAYS.resourceCreate,
        pendingLabel: 'Internet gateway',
      }),
    [runMutation]
  );

  const detachGateway = useCallback(
    async (id: string) => runMutation((s) => detachInternetGateway(s, id), { delayMs: DELAYS.attach }),
    [runMutation]
  );

  const createRouteResource = useCallback(
    async (input: Parameters<typeof createRoute>[1]) =>
      runMutation((s) => createRoute(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const removeRoute = useCallback(
    async (id: string) => runMutation((s) => deleteRoute(s, id), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  /* ---------------------------------------------------------------- */
  /* Load balancer                                                    */
  /* ---------------------------------------------------------------- */

  const createLoadBalancerResource = useCallback(
    async (input: Parameters<typeof createLoadBalancer>[1]) =>
      runMutation((s) => createLoadBalancer(s, input), {
        delayMs: DELAYS.loadBalancerProvision,
        pendingLabel: 'Load balancer',
      }),
    [runMutation]
  );

  const setLbBackends = useCallback(
    async (lbId: string, backendVmIds: string[]) =>
      runMutation((s) => setLoadBalancerBackends(s, lbId, backendVmIds), { delayMs: DELAYS.attach }),
    [runMutation]
  );

  const removeLoadBalancer = useCallback(
    async (id: string) => runMutation((s) => deleteLoadBalancer(s, id), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  /* ---------------------------------------------------------------- */
  /* Firewall policy (NSG)                                            */
  /* ---------------------------------------------------------------- */

  const createNsgResource = useCallback(
    async (name: string, vpcId: string) =>
      runMutation((s) => createNsg(s, { name, vpcId }), {
        delayMs: DELAYS.resourceCreate,
        pendingLabel: 'Firewall policy',
      }),
    [runMutation]
  );

  const addRuleToNsg = useCallback(
    async (nsgId: string, rule: Parameters<typeof addRule>[2]) =>
      runMutation((s) => addRule(s, nsgId, rule)),
    [runMutation]
  );

  const removeRuleFromNsg = useCallback(
    async (nsgId: string, ruleId: string) => runMutation((s) => deleteRule(s, nsgId, ruleId)),
    [runMutation]
  );

  const attachNsgToTargets = useCallback(
    async (nsgId: string, targets: { vmIds?: string[]; subnetIds?: string[] }) =>
      runMutation((s) => attachNsg(s, nsgId, targets), { delayMs: DELAYS.attach }),
    [runMutation]
  );

  const detachNsgFromTargets = useCallback(
    async (nsgId: string, targets: { vmIds?: string[]; subnetIds?: string[] }) =>
      runMutation((s) => detachNsg(s, nsgId, targets), { delayMs: DELAYS.attach }),
    [runMutation]
  );

  const removeNsg = useCallback(
    async (id: string, cascade = false) =>
      runMutation((s) => deleteNsg(s, id, { cascade }), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  /* ---------------------------------------------------------------- */
  /* Packet tracer                                                    */
  /* ---------------------------------------------------------------- */

  const sendPacket = useCallback(
    async (packet: Packet): Promise<TraceRecord | null> => {
      setIsTracing(true);
      const result = evaluatePacket(state, packet);

      // Pace the animation one hop at a time so the learner can follow it.
      for (let i = 0; i < result.hops.length; i++) {
        await simulateDelay(DELAYS.resourceCreate / 2);
      }

      const record: TraceRecord = {
        id: `trace-${Date.now()}-${state.traces.length + 1}`,
        timestamp: new Date().toISOString(),
        packet,
        result,
      };

      setState((prev) => ({ ...prev, traces: [record, ...prev.traces].slice(0, 50) }));
      setCurrentTrace(record);
      setIsTracing(false);
      return record;
    },
    [state]
  );

  const clearTraces = useCallback(() => {
    setState((prev) => ({ ...prev, traces: [] }));
    setCurrentTrace(null);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Lab management                                                   */
  /* ---------------------------------------------------------------- */

  const loadSample = useCallback(() => {
    setState(buildSampleNetwork());
    setCurrentTrace(null);
    setLabProgress({});
    notify('info', 'Sample network loaded. Open the Packet tracer to run the four demo traces.');
  }, [notify]);

  const loadErpArchitecture = useCallback(() => {
    try {
      setState(buildThreeTierErp().state);
      setCurrentTrace(null);
      setLabProgress({});
      notify(
        'success',
        'Three-tier ERP architecture loaded: 3 subnets, 3 firewall policies, 3 managed groups, 2 load balancers.'
      );
    } catch (error) {
      notify('error', 'The reference architecture could not be built.', String(error));
    }
  }, [notify]);

  const resetLab = useCallback(() => {
    setState(createInitialState());
    setCurrentTrace(null);
    setLabProgress({});
    notify('info', 'Lab reset. Every resource has been removed.');
  }, [notify]);

  /* ---------------------------------------------------------------- */
  /* Kubernetes                                                        */
  /* ---------------------------------------------------------------- */

  const loadKubernetesErp = useCallback(
    (options?: { clusterName?: string; replicas?: number; nodeCount?: number }) => {
      try {
        const built = buildKubernetesErp(options);
        setState(built.state);
        setCurrentTrace(null);
        setLabProgress({});
        notify(
          'success',
          `Kubernetes ERP built on "${built.cluster.name}": 3 deployments x ${built.web.replicas} replicas, 3 services, 2 gateways.`,
          `External address ${built.externalAddress}.`
        );
      } catch (error) {
        notify('error', 'The Kubernetes ERP could not be built.', String(error));
      }
    },
    [notify]
  );

  const clearKubernetes = useCallback(() => {
    const had = state.k8sClusters.length;
    if (had === 0) {
      notify('info', 'There are no clusters to remove.');
      return;
    }
    setState((prev) => removeAllK8sClusters(prev));
    notify('success', `Removed ${had} cluster(s) and their workloads. The lab network is untouched.`);
  }, [notify, state.k8sClusters.length]);

  const loadTestKubernetes = useCallback(() => {
    const result = loadTestErp(state, 95);
    if (!result.ok) {
      notify('error', result.message, result.howToFix);
      return;
    }
    setState(result.value.state);
    notify(result.value.scaled ? 'success' : 'info', result.message);
  }, [notify, state]);

  const createKubernetesCluster = useCallback(
    async (input: Parameters<typeof createK8sClusterEngine>[1]) =>
      runMutation((s) => createK8sClusterEngine(s, input), {
        delayMs: DELAYS.vmProvision,
        pendingLabel: 'Kubernetes cluster',
      }),
    [runMutation]
  );

  const resizeKubernetesCluster = useCallback(
    async (clusterId: string, nodeCount: number) =>
      runMutation((s) => resizeK8sClusterEngine(s, clusterId, nodeCount), {
        delayMs: DELAYS.vmProvision,
        pendingLabel: 'Node pool',
      }),
    [runMutation]
  );

  const removeKubernetesCluster = useCallback(
    async (clusterId: string, cascade = false) =>
      runMutation((s) => deleteK8sClusterEngine(s, clusterId, { cascade }), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  const createKubernetesNamespace = useCallback(
    async (input: Parameters<typeof createK8sNamespaceEngine>[1]) =>
      runMutation((s) => createK8sNamespaceEngine(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const createKubernetesDeployment = useCallback(
    async (input: Parameters<typeof createK8sDeploymentEngine>[1]) =>
      runMutation((s) => createK8sDeploymentEngine(s, input), {
        delayMs: DELAYS.vmProvision,
        pendingLabel: 'Workload',
      }),
    [runMutation]
  );

  const scaleKubernetesDeployment = useCallback(
    async (deploymentId: string, replicas: number) =>
      runMutation((s) => scaleK8sDeploymentEngine(s, deploymentId, replicas), { delayMs: DELAYS.attach }),
    [runMutation]
  );

  const updateKubernetesImage = useCallback(
    async (deploymentId: string, image: string) =>
      runMutation((s) => updateK8sDeploymentImageEngine(s, deploymentId, image), {
        delayMs: DELAYS.vmProvision,
        pendingLabel: 'Image rollout',
      }),
    [runMutation]
  );

  const removeKubernetesDeployment = useCallback(
    async (deploymentId: string, cascade = false) =>
      runMutation((s) => deleteK8sDeploymentEngine(s, deploymentId, { cascade }), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  const createKubernetesService = useCallback(
    async (input: Parameters<typeof createK8sServiceEngine>[1]) =>
      runMutation((s) => createK8sServiceEngine(s, input), {
        delayMs: input.type === 'LoadBalancer' ? DELAYS.loadBalancerProvision : DELAYS.resourceCreate,
        pendingLabel: 'Service',
      }),
    [runMutation]
  );

  const removeKubernetesService = useCallback(
    async (serviceId: string, cascade = false) =>
      runMutation((s) => deleteK8sServiceEngine(s, serviceId, { cascade }), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  const createKubernetesIngress = useCallback(
    async (input: Parameters<typeof createK8sIngressEngine>[1]) =>
      runMutation((s) => createK8sIngressEngine(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const createKubernetesGateway = useCallback(
    async (input: Parameters<typeof createK8sGatewayEngine>[1]) =>
      runMutation((s) => createK8sGatewayEngine(s, input), {
        delayMs: DELAYS.loadBalancerProvision,
        pendingLabel: 'Gateway',
      }),
    [runMutation]
  );

  const removeKubernetesGateway = useCallback(
    async (gatewayId: string) =>
      runMutation((s) => deleteK8sGatewayEngine(s, gatewayId), { delayMs: DELAYS.delete }),
    [runMutation]
  );

  const createKubernetesConfigMap = useCallback(
    async (input: Parameters<typeof createK8sConfigMapEngine>[1]) =>
      runMutation((s) => createK8sConfigMapEngine(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const createKubernetesSecret = useCallback(
    async (input: Parameters<typeof createK8sSecretEngine>[1]) =>
      runMutation((s) => createK8sSecretEngine(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const createKubernetesPvc = useCallback(
    async (input: Parameters<typeof createK8sPvcEngine>[1]) =>
      runMutation((s) => createK8sPvcEngine(s, input), { delayMs: DELAYS.resourceCreate, pendingLabel: 'Volume' }),
    [runMutation]
  );

  const createKubernetesAutoscaler = useCallback(
    async (input: Parameters<typeof createK8sAutoscalerEngine>[1]) =>
      runMutation((s) => createK8sAutoscalerEngine(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const reconcileKubernetesAutoscaler = useCallback(
    async (autoscalerId: string) =>
      runMutation((s) => reconcileK8sAutoscalerEngine(s, autoscalerId), { delayMs: DELAYS.attach }),
    [runMutation]
  );

  /* ---------------------------------------------------------------- */
  /* Cloud SQL and AlloyDB                                            */
  /* ---------------------------------------------------------------- */

  const createSqlInstance = useCallback(
    async (input: Parameters<typeof createSqlInstanceEngine>[1]) =>
      runMutation((s) => createSqlInstanceEngine(s, input), {
        delayMs: DELAYS.vmProvision,
        pendingLabel: 'Cloud SQL instance',
      }),
    [runMutation]
  );

  const restartSqlInstance = useCallback(
    async (id: string) => runMutation((s) => restartSqlInstanceEngine(s, id), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const stopSqlInstance = useCallback(
    async (id: string) => runMutation((s) => stopSqlInstanceEngine(s, id)),
    [runMutation]
  );

  const setSqlDeletionProtection = useCallback(
    async (id: string, enabled: boolean) =>
      runMutation((s) => setSqlDeletionProtectionEngine(s, id, enabled)),
    [runMutation]
  );

  const setSqlPointInTimeRecovery = useCallback(
    async (id: string, enabled: boolean) => runMutation((s) => setSqlPitrEngine(s, id, enabled)),
    [runMutation]
  );

  const deleteSqlInstance = useCallback(
    async (id: string, cascade = false) =>
      runMutation((s) => deleteSqlInstanceEngine(s, id, { cascade })),
    [runMutation]
  );

  const createSqlDatabase = useCallback(
    async (input: { instanceId: string; name: string }) =>
      runMutation((s) => createSqlDatabaseEngine(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const deleteSqlDatabase = useCallback(
    async (id: string) => runMutation((s) => deleteSqlDatabaseEngine(s, id)),
    [runMutation]
  );

  const createSqlUser = useCallback(
    async (input: { instanceId: string; name: string; password: string; type?: 'BUILT_IN' | 'CLOUD_IAM_SERVICE_ACCOUNT' }) =>
      runMutation((s) => createSqlUserEngine(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const deleteSqlUser = useCallback(
    async (id: string) => runMutation((s) => deleteSqlUserEngine(s, id)),
    [runMutation]
  );

  const createSqlBackup = useCallback(
    async (input: { instanceId: string; type?: 'ON_DEMAND' | 'AUTOMATED' }) =>
      runMutation((s) => createSqlBackupEngine(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const deleteSqlBackup = useCallback(
    async (id: string) => runMutation((s) => deleteSqlBackupEngine(s, id)),
    [runMutation]
  );

  /* ---------------------------------------------------------------- */
  /* Cloud KMS                                                        */
  /* ---------------------------------------------------------------- */

  const createKmsKeyRing = useCallback(
    async (input: { name: string; location: string }) =>
      runMutation((s) => createKeyRingEngine(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const deleteKmsKeyRing = useCallback(
    async (id: string, cascade = false) =>
      runMutation((s) => deleteKeyRingEngine(s, id, { cascade })),
    [runMutation]
  );

  const createKmsKey = useCallback(
    async (input: Parameters<typeof createKmsKeyEngine>[1]) =>
      runMutation((s) => createKmsKeyEngine(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const setKmsKeyEnabled = useCallback(
    async (id: string, enabled: boolean) => runMutation((s) => setKmsKeyEnabledEngine(s, id, enabled)),
    [runMutation]
  );

  const destroyKmsKey = useCallback(
    async (id: string) => runMutation((s) => destroyKmsKeyEngine(s, id)),
    [runMutation]
  );

  const cancelKmsDestruction = useCallback(
    async (id: string) => runMutation((s) => cancelKmsDestructionEngine(s, id)),
    [runMutation]
  );

  const addKmsKeyVersion = useCallback(
    async (id: string) => runMutation((s) => addKmsKeyVersionEngine(s, id), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const setKmsPrimaryVersion = useCallback(
    async (keyId: string, versionId: string) =>
      runMutation((s) => setKmsPrimaryVersionEngine(s, keyId, versionId)),
    [runMutation]
  );

  /* ---------------------------------------------------------------- */
  /* Cloud Monitoring                                                 */
  /* ---------------------------------------------------------------- */

  const createAlertPolicy = useCallback(
    async (input: Parameters<typeof createAlertPolicyEngine>[1]) =>
      runMutation((s) => createAlertPolicyEngine(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const setAlertPolicyEnabled = useCallback(
    async (id: string, enabled: boolean) => runMutation((s) => setAlertPolicyEnabledEngine(s, id, enabled)),
    [runMutation]
  );

  const deleteAlertPolicy = useCallback(
    async (id: string) => runMutation((s) => deleteAlertPolicyEngine(s, id)),
    [runMutation]
  );

  const createUptimeCheck = useCallback(
    async (input: Parameters<typeof createUptimeCheckEngine>[1]) =>
      runMutation((s) => createUptimeCheckEngine(s, input), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const runUptimeCheck = useCallback(
    async (id: string) => runMutation((s) => runUptimeCheckEngine(s, id), { delayMs: DELAYS.resourceCreate }),
    [runMutation]
  );

  const deleteUptimeCheck = useCallback(
    async (id: string) => runMutation((s) => deleteUptimeCheckEngine(s, id)),
    [runMutation]
  );

  /**
   * Simulated gcloud entry point for the Cloud Shell.
   *
   * Mutations go through the same engine functions the UI calls, so there is one
   * code path for validation and IP allocation regardless of who triggered it.
   */
  const runShellCommand = useCallback(
    (command: string): string[] => {
      if (!isNetlabCommand(command)) return [];

      const result = runNetlabCommand(state, command);
      if (!result) return [`ERROR: Command not recognised by the networking lab.`];

      if (result.apply) {
        void Promise.resolve(result.apply(state)).then((next) => {
          setState(next);
          notify('info', 'Applied change from the simulated Cloud Shell.', command);
        });
      }

      if (result.trace) {
        void sendPacket({
          sourceIp: result.trace.sourceIp,
          destIp: result.trace.destIp,
          protocol: 'tcp',
          destPort: result.trace.destPort,
          sourcePort: 40000,
        });
      }

      return result.lines;
    },
    [notify, sendPacket, state]
  );

  const exportLab = useCallback(
    () => JSON.stringify({ version: 1, savedAt: new Date().toISOString(), state }, null, 2),
    [state]
  );

  const importLab = useCallback(
    (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as { version?: number; state?: SimState };
        if (parsed.version !== 1 || !parsed.state?.vpcs) {
          notify('error', 'That file is not a valid LocalCloud lab export.', 'Export the lab first, then import that file.');
          return false;
        }
        setState(normalizeSimState(parsed.state));
        setCurrentTrace(null);
        notify('success', 'Lab imported successfully.');
        return true;
      } catch {
        notify('error', 'That file is not valid JSON.', 'Choose a .json file produced by the "Export lab" button.');
        return false;
      }
    },
    [notify]
  );

  const value = useMemo<NetLabContextValue>(
    () => ({
      state,
      toasts,
      pending,
      isLoading,
      isTracing,
      currentTrace,
      storageAdapterName: adapter.name,
      speed: getSpeed(),
      labProgress,
      guidedLabOpen,
      activeSection,
      setActiveSection,
      setGuidedLabOpen,
      dismissToast,
      notify,
      markLabStep,
      createSqlInstance,
      restartSqlInstance,
      stopSqlInstance,
      setSqlDeletionProtection,
      setSqlPointInTimeRecovery,
      deleteSqlInstance,
      createSqlDatabase,
      deleteSqlDatabase,
      createSqlUser,
      deleteSqlUser,
      createSqlBackup,
      deleteSqlBackup,
      createKmsKeyRing,
      deleteKmsKeyRing,
      createKmsKey,
      setKmsKeyEnabled,
      destroyKmsKey,
      cancelKmsDestruction,
      addKmsKeyVersion,
      setKmsPrimaryVersion,
      createAlertPolicy,
      setAlertPolicyEnabled,
      deleteAlertPolicy,
      createUptimeCheck,
      runUptimeCheck,
      deleteUptimeCheck,
      createVpcNetwork,
      removeVpc,
      createSubnetResource,
      removeSubnet,
      createVmResource,
      changeVmPower,
      removeVm,
      createDiskResource,
      attachDiskToVm,
      detachDiskFromVm,
      removeDisk,
      createSnapshotResource,
      removeSnapshot,
      createTemplateResource,
      removeTemplate,
      createGroupResource,
      resizeGroup,
      removeGroup,
      attachGateway,
      detachGateway,
      createRouteResource,
      removeRoute,
      createLoadBalancerResource,
      setLbBackends,
      removeLoadBalancer,
      createNsgResource,
      addRuleToNsg,
      removeRuleFromNsg,
      attachNsgToTargets,
      detachNsgFromTargets,
      removeNsg,
      sendPacket,
      clearTraces,
      loadSample,
      loadErpArchitecture,
      resetLab,
      loadKubernetesErp,
      clearKubernetes,
      loadTestKubernetes,
      createKubernetesCluster,
      resizeKubernetesCluster,
      removeKubernetesCluster,
      createKubernetesNamespace,
      createKubernetesDeployment,
      scaleKubernetesDeployment,
      updateKubernetesImage,
      removeKubernetesDeployment,
      createKubernetesService,
      removeKubernetesService,
      createKubernetesIngress,
      createKubernetesGateway,
      removeKubernetesGateway,
      createKubernetesConfigMap,
      createKubernetesSecret,
      createKubernetesPvc,
      createKubernetesAutoscaler,
      reconcileKubernetesAutoscaler,
      runShellCommand,
      exportLab,
      importLab,
    }),
    [
      state,
      toasts,
      pending,
      isLoading,
      isTracing,
      currentTrace,
      labProgress,
      guidedLabOpen,
      activeSection,
      dismissToast,
      notify,
      markLabStep,
      createSqlInstance,
      restartSqlInstance,
      stopSqlInstance,
      setSqlDeletionProtection,
      setSqlPointInTimeRecovery,
      deleteSqlInstance,
      createSqlDatabase,
      deleteSqlDatabase,
      createSqlUser,
      deleteSqlUser,
      createSqlBackup,
      deleteSqlBackup,
      createKmsKeyRing,
      deleteKmsKeyRing,
      createKmsKey,
      setKmsKeyEnabled,
      destroyKmsKey,
      cancelKmsDestruction,
      addKmsKeyVersion,
      setKmsPrimaryVersion,
      createAlertPolicy,
      setAlertPolicyEnabled,
      deleteAlertPolicy,
      createUptimeCheck,
      runUptimeCheck,
      deleteUptimeCheck,
      createVpcNetwork,
      removeVpc,
      createSubnetResource,
      removeSubnet,
      createVmResource,
      changeVmPower,
      removeVm,
      createDiskResource,
      attachDiskToVm,
      detachDiskFromVm,
      removeDisk,
      createSnapshotResource,
      removeSnapshot,
      createTemplateResource,
      removeTemplate,
      createGroupResource,
      resizeGroup,
      removeGroup,
      attachGateway,
      detachGateway,
      createRouteResource,
      removeRoute,
      createLoadBalancerResource,
      setLbBackends,
      removeLoadBalancer,
      createNsgResource,
      addRuleToNsg,
      removeRuleFromNsg,
      attachNsgToTargets,
      detachNsgFromTargets,
      removeNsg,
      sendPacket,
      clearTraces,
      loadSample,
      loadErpArchitecture,
      resetLab,
      loadKubernetesErp,
      clearKubernetes,
      loadTestKubernetes,
      createKubernetesCluster,
      resizeKubernetesCluster,
      removeKubernetesCluster,
      createKubernetesNamespace,
      createKubernetesDeployment,
      scaleKubernetesDeployment,
      updateKubernetesImage,
      removeKubernetesDeployment,
      createKubernetesService,
      removeKubernetesService,
      createKubernetesIngress,
      createKubernetesGateway,
      removeKubernetesGateway,
      createKubernetesConfigMap,
      createKubernetesSecret,
      createKubernetesPvc,
      createKubernetesAutoscaler,
      reconcileKubernetesAutoscaler,
      runShellCommand,
      exportLab,
      importLab,
    ]
  );

  return <NetLabContext.Provider value={value}>{children}</NetLabContext.Provider>;
};

export function useNetLab(): NetLabContextValue {
  const context = useContext(NetLabContext);
  if (!context) {
    throw new Error('useNetLab must be used inside a <NetLabProvider>.');
  }
  return context;
}