/**
 * Clusters page: create a GKE cluster by hand, resize its node pool and delete it.
 *
 * The cluster is only a node pool plus a firewall policy in the simulation, so
 * the form asks for exactly what a real gcloud call would: a network, a subnet,
 * a region, a machine type and a node count.
 */

import React, { useState } from 'react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Button, Card, EmptyState, Field, MetaRow, StatusBadge, inputClass } from '../../netlab/components/ui';
import { Column, DataTable, FormPanel, formatTime } from '../../netlab/components/tables';
import { K8sCluster } from '../../sim/types';

const MACHINE_TYPES = ['e2-standard-2', 'e2-standard-4', 'e2-standard-8', 'n2-standard-4'] as const;
const VERSIONS = ['1.31.0-gke.1002000', '1.30.5-gke.1018000'] as const;

export const ClustersPage: React.FC = () => {
  const {
    state,
    pending,
    createKubernetesCluster,
    resizeKubernetesCluster,
    removeKubernetesCluster
  } = useNetLab();

  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState('');
  const [vpcId, setVpcId] = useState('');
  const [subnetId, setSubnetId] = useState('');
  const [region, setRegion] = useState('us-central1');
  const [machineType, setMachineType] = useState<(typeof MACHINE_TYPES)[number]>('e2-standard-4');
  const [version, setVersion] = useState<(typeof VERSIONS)[number]>(VERSIONS[0]);
  const [nodeCount, setNodeCount] = useState(3);

  const isPending = pending.some((p) => p.kind === 'Kubernetes cluster' || p.kind === 'Node pool');
  const effectiveVpc = vpcId || state.vpcs[0]?.id || '';
  const eligibleSubnets = state.subnets.filter((s) => !effectiveVpc || s.vpcId === effectiveVpc);
  const effectiveSubnet = subnetId || eligibleSubnets[0]?.id || '';

  const submit = async () => {
    const created = await createKubernetesCluster({
      name,
      vpcId: effectiveVpc,
      subnetId: effectiveSubnet,
      region,
      machineType,
      version,
      nodeCount,
      minNodeCount: 1,
      maxNodeCount: Math.max(3, nodeCount * 3)
    });
    if (created) {
      setName('');
      setPanelOpen(false);
    }
  };

  const canSubmit = Boolean(name.trim() && effectiveVpc && effectiveSubnet);

  const columns: Column<K8sCluster>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />
    },
    {
      key: 'nodes',
      header: 'Nodes',
      numeric: true,
      render: (row) => (
        <span>
          {row.vmIds.length}
          <span className="text-[var(--text-muted)]"> ({row.minNodeCount}-{row.maxNodeCount})</span>
        </span>
      )
    },
    {
      key: 'version',
      header: 'Version',
      render: (row) => <span className="font-mono text-[11px]">{row.version}</span>
    },
    {
      key: 'machineType',
      header: 'Machine type',
      render: (row) => <span className="font-mono text-[11px]">{row.machineType}</span>
    },
    {
      key: 'network',
      header: 'Network',
      render: (row) => (
        <span className="font-mono text-[11px]">
          {state.subnets.find((s) => s.id === row.subnetId)?.name ?? '(deleted)'}
        </span>
      )
    },
    { key: 'created', header: 'Created', render: (row) => formatTime(row.createdAt) },
    {
      key: 'action',
      header: '',
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            disabled={isPending || row.vmIds.length >= row.maxNodeCount}
            onClick={() => void resizeKubernetesCluster(row.id, row.vmIds.length + 1)}
            title="Add one node"
          >
            + Node
          </Button>
          <Button
            size="sm"
            disabled={isPending || row.vmIds.length <= row.minNodeCount}
            onClick={() => void resizeKubernetesCluster(row.id, row.vmIds.length - 1)}
            title="Remove one node"
          >
            - Node
          </Button>
          <Button size="sm" variant="danger" onClick={() => void removeKubernetesCluster(row.id, true)}>
            Delete
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Clusters</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Each cluster owns a node pool of real VMs in a subnet, a firewall policy, and the namespaces below it.
          </p>
        </div>
        <Button onClick={() => setPanelOpen((v) => !v)}>
          {panelOpen ? 'Cancel' : 'Create cluster'}
        </Button>
      </header>

      <FormPanel open={panelOpen} title="Create a cluster" onClose={() => setPanelOpen(false)} footer={<div className="flex gap-2"><Button variant="secondary" onClick={() => setPanelOpen(false)}>Cancel</Button><Button onClick={() => void submit()} disabled={!canSubmit || isPending}>Create</Button></div>}>
        <Field label="Cluster name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="erp-gke" />
        </Field>
        <Field label="VPC network">
          <select className={inputClass} value={effectiveVpc} onChange={(e) => { setVpcId(e.target.value); setSubnetId(''); }}>
            {state.vpcs.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Subnet">
          <select className={inputClass} value={effectiveSubnet} onChange={(e) => setSubnetId(e.target.value)}>
            {eligibleSubnets.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.cidr})</option>
            ))}
          </select>
        </Field>
        <Field label="Region">
          <input className={inputClass} value={region} onChange={(e) => setRegion(e.target.value)} />
        </Field>
        <Field label="Machine type">
          <select className={inputClass} value={machineType} onChange={(e) => setMachineType(e.target.value as (typeof MACHINE_TYPES)[number])}>
            {MACHINE_TYPES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Kubernetes version">
          <select className={inputClass} value={version} onChange={(e) => setVersion(e.target.value as (typeof VERSIONS)[number])}>
            {VERSIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Initial nodes">
          <input
            type="number"
            className={inputClass}
            value={nodeCount}
            min={1}
            max={20}
            onChange={(e) => setNodeCount(Number(e.target.value))}
          />
        </Field>
      </FormPanel>

      {state.vpcs.length === 0 ? (
        <EmptyState
          title="No network to build on"
          message="A cluster needs a VPC and a subnet. Create one in the Lab VPC networks or Lab subnetworks tabs first."
        />
      ) : state.k8sClusters.length === 0 ? (
        <EmptyState title="No clusters yet" message="Create one above, or build the full reference ERP from the Kubernetes overview." />
      ) : (
        <Card title={`${state.k8sClusters.length} cluster(s)`}>
          <DataTable rows={state.k8sClusters} columns={columns} emptyTitle="Nothing here yet" emptyMessage="No clusters." />
        </Card>
      )}

      {state.k8sClusters.length > 0 && (
        <Card title="Cluster detail">
          <div className="space-y-3">
            {state.k8sClusters.map((cluster) => {
              const namespaces = state.k8sNamespaces.filter((n) => n.clusterId === cluster.id);
              return (
                <div key={cluster.id}>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
                    <MetaRow label="Cluster" value={cluster.name} />
                    <MetaRow label="Zone" value={<span className="font-mono text-[11px]">{cluster.zone}</span>} />
                    <MetaRow
                      label="Endpoint"
                      value={<span className="font-mono text-[11px]">{cluster.endpoint}</span>}
                    />
                    <MetaRow label="Network tag" value={<span className="font-mono text-[11px]">{cluster.networkTag}</span>} />
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Namespaces: {namespaces.map((n) => n.name).join(', ')}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};