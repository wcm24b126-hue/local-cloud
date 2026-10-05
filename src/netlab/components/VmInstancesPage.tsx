/**
 * VM instances page: create with automatic internal IP assignment, external IP
 * option, power cycling, and delete.
 */

import React, { useState } from 'react';
import { useNetLab } from '../NetLabContext';
import { Button, Callout, Field, StatusBadge, inputClass } from './ui';
import { Column, DataTable, FormPanel, formatTime } from './tables';
import { Vm } from '../../sim/types';

const MACHINE_TYPES = ['e2-micro', 'e2-small', 'e2-medium', 'n1-standard-1'];
const ZONES = ['us-central1-a', 'us-central1-b', 'us-east1-b', 'europe-west1-b'];

export const VmInstancesPage: React.FC = () => {
  const { state, pending, createVmResource, changeVmPower, removeVm } = useNetLab();
  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState('');
  const [subnetId, setSubnetId] = useState('');
  const [zone, setZone] = useState(ZONES[0]);
  const [machineType, setMachineType] = useState(MACHINE_TYPES[0]);
  const [withExternalIp, setWithExternalIp] = useState(false);
  const [tags, setTags] = useState('');

  const isPending = pending.some((p) => p.kind === 'VM instance');
  const effectiveSubnetId = subnetId || state.subnets[0]?.id || '';
  const subnet = state.subnets.find((s) => s.id === effectiveSubnetId);
  const hasGateway = subnet ? state.gateways.some((g) => g.vpcId === subnet.vpcId) : false;

  const submit = async () => {
    const ok = await createVmResource({
      name,
      subnetId: effectiveSubnetId,
      zone,
      machineType,
      withExternalIp,
      networkTags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    if (ok) {
      setName('');
      setTags('');
      setPanelOpen(false);
    }
  };

  const columns: Column<Vm>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'internal',
      header: 'Internal IP',
      render: (row) => <span className="font-mono text-[11px] tabular-nums">{row.internalIp}</span>,
    },
    {
      key: 'external',
      header: 'External IP',
      render: (row) =>
        row.externalIp ? (
          <span className="font-mono text-[11px] tabular-nums">{row.externalIp}</span>
        ) : (
          <span className="text-[var(--text-muted)]">-</span>
        ),
    },
    {
      key: 'subnet',
      header: 'Subnet',
      render: (row) => state.subnets.find((s) => s.id === row.subnetId)?.name ?? '-',
    },
    { key: 'zone', header: 'Zone', render: (row) => <span className="font-mono text-[11px]">{row.zone}</span> },
    { key: 'type', header: 'Machine type', render: (row) => <span className="font-mono text-[11px]">{row.machineType}</span> },
    {
      key: 'tags',
      header: 'Network tags',
      render: (row) =>
        row.networkTags.length ? (
          <span className="font-mono text-[11px]">{row.networkTags.join(', ')}</span>
        ) : (
          <span className="text-[var(--text-muted)]">-</span>
        ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'created', header: 'Created', render: (row) => formatTime(row.createdAt) },
    {
      key: 'action',
      header: '',
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            onClick={() => void changeVmPower(row.id, row.status !== 'RUNNING')}
            disabled={row.status === 'TERMINATED'}
          >
            {row.status === 'RUNNING' ? 'Stop' : 'Start'}
          </Button>
          <Button size="sm" variant="danger" onClick={() => void removeVm(row.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">VM instances</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Each VM takes the first free usable address in its subnet. External IPs come from a shared pool, so they
            are only reachable when the VPC has an internet gateway.
          </p>
        </div>
        <Button variant="primary" onClick={() => setPanelOpen(true)} disabled={state.subnets.length === 0}>
          Create VM instance
        </Button>
      </header>

      {state.subnets.length === 0 ? (
        <Callout tone="info" title="Create a subnet first">
          VM instances need a subnet to place their network interface. Create one on the Subnetworks page.
        </Callout>
      ) : null}

      <DataTable
        columns={columns}
        rows={state.vms}
        isPending={isPending}
        pendingLabel="Provisioning VM instance…"
        emptyTitle="No VM instances yet"
        emptyMessage="Create a VM to give the packet tracer a source and a destination to trace between."
      />

      <FormPanel
        open={panelOpen}
        title="Create VM instance"
        description="Provisioning is simulated. Watch the status move through PROVISIONING to RUNNING."
        onClose={() => setPanelOpen(false)}
        footer={
          <>
            <Button onClick={() => setPanelOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void submit()} disabled={name.trim().length === 0 || !effectiveSubnetId}>
              Create
            </Button>
          </>
        }
      >
        <Field label="Instance name" htmlFor="vm-name">
          <input id="vm-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="web-1" />
        </Field>

        <Field label="Zone" htmlFor="vm-zone">
          <select id="vm-zone" className={inputClass} value={zone} onChange={(e) => setZone(e.target.value)}>
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Subnet" htmlFor="vm-subnet">
          <select id="vm-subnet" className={inputClass} value={effectiveSubnetId} onChange={(e) => setSubnetId(e.target.value)}>
            {state.subnets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.cidr})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Machine type" htmlFor="vm-type">
          <select id="vm-type" className={inputClass} value={machineType} onChange={(e) => setMachineType(e.target.value)}>
            {MACHINE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Network tags" hint="Comma separated. Tags are metadata only; firewall rules reference IP ranges here." htmlFor="vm-tags">
          <input id="vm-tags" className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="http-server, web" />
        </Field>

        <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={withExternalIp}
            onChange={(e) => setWithExternalIp(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Assign an external IP address.
            {!hasGateway && withExternalIp ? (
              <span className="mt-1 block text-[var(--warning)]">
                This VPC has no internet gateway, so traffic to the external IP will be dropped at the route table.
              </span>
            ) : null}
          </span>
        </label>
      </FormPanel>
    </div>
  );
};