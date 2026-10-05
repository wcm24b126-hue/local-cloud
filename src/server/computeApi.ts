/**
 * Compute Engine REST API Compatibility Layer
 * Emulates /compute/v1/projects/{project}/... REST endpoints conforming to Google Compute Engine API specifications.
 * Supports instance lifecycle, zones, machine types, operations, networks, subnets, and firewalls.
 */

import { VmInstance, VpcFirewallRule, VpcNetwork, VpcSubnet } from '../types';

export interface ComputeOperationResource {
  kind: 'compute#operation';
  id: string;
  name: string;
  zone?: string;
  operationType: 'insert' | 'start' | 'stop' | 'reset' | 'delete';
  targetLink: string;
  targetId: string;
  status: 'PENDING' | 'RUNNING' | 'DONE';
  user: string;
  progress: number;
  insertTime: string;
  startTime: string;
  endTime?: string;
  selfLink: string;
}

export interface ComputeInstanceResource {
  kind: 'compute#instance';
  id: string;
  creationTimestamp: string;
  name: string;
  description?: string;
  zone: string;
  machineType: string;
  status: string;
  canIpForward: boolean;
  networkInterfaces: Array<{
    network: string;
    subnetwork: string;
    networkIP: string;
    accessConfigs?: Array<{
      type: string;
      name: string;
      natIP: string;
    }>;
  }>;
  disks: Array<{
    type: string;
    mode: string;
    source?: string;
    boot: boolean;
    autoDelete: boolean;
    diskSizeGb: string;
    interface: string;
  }>;
  serviceAccounts?: Array<{
    email: string;
    scopes: string[];
  }>;
  tags?: {
    items: string[];
  };
  selfLink: string;
}

export function formatComputeInstance(vm: VmInstance, projectId: string): ComputeInstanceResource {
  const zoneUrl = `https://www.googleapis.com/compute/v1/projects/${projectId}/zones/${vm.zone}`;
  return {
    kind: 'compute#instance',
    id: vm.id.replace('vm-', ''),
    creationTimestamp: vm.createdAt,
    name: vm.name,
    description: vm.description,
    zone: zoneUrl,
    machineType: `${zoneUrl}/machineTypes/${vm.machineType}`,
    status: vm.status,
    canIpForward: false,
    networkInterfaces: [
      {
        network: `https://www.googleapis.com/compute/v1/projects/${projectId}/global/networks/${vm.networkName}`,
        subnetwork: `https://www.googleapis.com/compute/v1/projects/${projectId}/regions/${vm.zone.replace(/-[a-z]$/, '')}/subnetworks/${vm.subnetName}`,
        networkIP: vm.internalIp,
        accessConfigs: vm.externalIp
          ? [
              {
                type: 'ONE_TO_ONE_NAT',
                name: 'External NAT',
                natIP: vm.externalIp,
              },
            ]
          : [],
      },
    ],
    disks: [
      {
        type: 'PERSISTENT',
        mode: 'READ_WRITE',
        boot: true,
        autoDelete: true,
        diskSizeGb: String(vm.bootDiskSizeGb),
        interface: 'SCSI',
      },
    ],
    serviceAccounts: vm.serviceAccountEmail
      ? [
          {
            email: vm.serviceAccountEmail,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          },
        ]
      : [],
    tags: {
      items: vm.networkTags,
    },
    selfLink: `${zoneUrl}/instances/${vm.name}`,
  };
}

export function createOperationResource(
  type: ComputeOperationResource['operationType'],
  vm: VmInstance,
  projectId: string
): ComputeOperationResource {
  const opId = `op-${Date.now()}`;
  return {
    kind: 'compute#operation',
    id: opId,
    name: `operation-${opId}`,
    zone: `https://www.googleapis.com/compute/v1/projects/${projectId}/zones/${vm.zone}`,
    operationType: type,
    targetLink: `https://www.googleapis.com/compute/v1/projects/${projectId}/zones/${vm.zone}/instances/${vm.name}`,
    targetId: vm.id,
    status: 'RUNNING',
    user: 'student@localcloud.dev',
    progress: 50,
    insertTime: new Date().toISOString(),
    startTime: new Date().toISOString(),
    selfLink: `https://www.googleapis.com/compute/v1/projects/${projectId}/zones/${vm.zone}/operations/operation-${opId}`,
  };
}

/**
 * In-memory Dispatcher for Compute Engine REST API
 */
export class LocalComputeApiEngine {
  private operations: Map<string, ComputeOperationResource> = new Map();

  constructor(
    private getVms: () => VmInstance[],
    private getNetworks: () => VpcNetwork[],
    private getSubnets: () => VpcSubnet[],
    private getFirewalls: () => VpcFirewallRule[],
    private onVmCreate: (data: Partial<VmInstance>) => VmInstance,
    private onVmStart: (id: string) => void,
    private onVmStop: (id: string) => void,
    private onVmReset: (id: string) => void,
    private onVmDelete: (id: string) => void
  ) {}

  public listInstances(projectId: string, zone?: string) {
    const list = this.getVms().filter(vm => !zone || vm.zone === zone);
    return {
      kind: 'compute#instanceList',
      id: `projects/${projectId}/instances`,
      items: list.map(vm => formatComputeInstance(vm, projectId)),
      selfLink: `https://www.googleapis.com/compute/v1/projects/${projectId}/aggregated/instances`,
    };
  }

  public getInstance(projectId: string, zone: string, instanceName: string) {
    const vm = this.getVms().find(v => v.name === instanceName && (!zone || v.zone === zone));
    if (!vm) {
      throw new Error(`Instance ${instanceName} not found in zone ${zone}`);
    }
    return formatComputeInstance(vm, projectId);
  }

  public insertInstance(projectId: string, zone: string, body: any) {
    const newVm = this.onVmCreate({
      name: body.name,
      description: body.description,
      zone,
      machineType: body.machineType?.split('/').pop() || 'e2-micro',
      allowHttp: body.tags?.items?.includes('http-server'),
      allowHttps: body.tags?.items?.includes('https-server'),
      networkTags: body.tags?.items || [],
    });

    const op = createOperationResource('insert', newVm, projectId);
    this.operations.set(op.name, op);

    // Auto-complete operation in background
    setTimeout(() => {
      const existing = this.operations.get(op.name);
      if (existing) {
        existing.status = 'DONE';
        existing.progress = 100;
        existing.endTime = new Date().toISOString();
      }
    }, 3500);

    return op;
  }

  public startInstance(projectId: string, zone: string, instanceName: string) {
    const vm = this.getVms().find(v => v.name === instanceName);
    if (!vm) throw new Error(`Instance ${instanceName} not found`);
    this.onVmStart(vm.id);
    const op = createOperationResource('start', vm, projectId);
    return op;
  }

  public stopInstance(projectId: string, zone: string, instanceName: string) {
    const vm = this.getVms().find(v => v.name === instanceName);
    if (!vm) throw new Error(`Instance ${instanceName} not found`);
    this.onVmStop(vm.id);
    const op = createOperationResource('stop', vm, projectId);
    return op;
  }

  public deleteInstance(projectId: string, zone: string, instanceName: string) {
    const vm = this.getVms().find(v => v.name === instanceName);
    if (!vm) throw new Error(`Instance ${instanceName} not found`);
    this.onVmDelete(vm.id);
    const op = createOperationResource('delete', vm, projectId);
    return op;
  }

  public getOperation(operationName: string) {
    const op = this.operations.get(operationName);
    if (!op) {
      return {
        kind: 'compute#operation',
        status: 'DONE',
        progress: 100,
      };
    }
    return op;
  }
}
