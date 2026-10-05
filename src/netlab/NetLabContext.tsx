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
import { buildSampleNetwork } from '../sim/seed';
import { Packet, SimResult, SimState, TraceRecord } from '../sim/types';
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

  /**
   * Run a simulated gcloud command against the lab. Returns the lines the shell
   * should print. Mutations are committed through the same engine the UI uses, so
   * the CLI and the UI can never diverge.
   */
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
        if (!cancelled && loaded) setState(loaded);
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
        setState(parsed.state);
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