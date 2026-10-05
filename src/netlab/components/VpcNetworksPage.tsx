/**
 * VPC networks page: list, create, and delete with dependency checks.
 */

import React, { useState } from 'react';
import { useNetLab } from '../NetLabContext';
import { Button, Card, Field, StatusBadge, inputClass } from './ui';
import { Column, DataTable, FormPanel, formatTime } from './tables';
import { Vpc } from '../../sim/types';

export const VpcNetworksPage: React.FC = () => {
  const { state, pending, createVpcNetwork, removeVpc, loadSample } = useNetLab();
  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState('');
  const [routingMode, setRoutingMode] = useState<'regional' | 'global'>('regional');
  const [cascadeVpc, setCascadeVpc] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const isPending = pending.some((p) => p.kind === 'VPC network');
  const selected = state.vpcs.find((v) => v.id === detail) ?? null;

  const columns: Column<Vpc>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    { key: 'mode', header: 'Mode', render: (row) => <span className="font-mono text-[11px]">{row.mode}</span> },
    {
      key: 'routing',
      header: 'Dynamic routing',
      render: (row) => <span className="capitalize">{row.routingMode}</span>,
    },
    {
      key: 'subnets',
      header: 'Subnets',
      numeric: true,
      render: (row) => state.subnets.filter((s) => s.vpcId === row.id).length,
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'created', header: 'Created', render: (row) => formatTime(row.createdAt) },
  ];

  const submit = async () => {
    const ok = await createVpcNetwork(name, routingMode);
    if (ok) {
      setName('');
      setPanelOpen(false);
    }
  };

  const remove = async (id: string, cascade: boolean) => {
    await removeVpc(id, cascade);
    setCascadeVpc(null);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">VPC networks</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            A Virtual Private Cloud is the isolated network boundary for your resources. Every subnetwork, VM,
            route and firewall policy lives inside one.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void loadSample()}>Load sample network</Button>
          <Button variant="primary" onClick={() => setPanelOpen(true)}>
            Create VPC network
          </Button>
        </div>
      </header>

      <DataTable
        columns={columns}
        rows={state.vpcs}
        onRowClick={(row) => setDetail(row.id === detail ? null : row.id)}
        isPending={isPending}
        pendingLabel="Creating VPC network…"
        emptyTitle="No VPC networks yet"
        emptyMessage="A VPC network is the container for everything else in this lab. Create one to begin."
        emptyAction={
          <Button variant="primary" size="sm" onClick={() => setPanelOpen(true)}>
            Create your first VPC network
          </Button>
        }
      />

      {selected ? (
        <Card
          title={`Details · ${selected.name}`}
          action={<Button size="sm" variant="danger" onClick={() => setCascadeVpc(selected.id)}>Delete</Button>}
        >
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
            <div className="flex justify-between border-b border-[var(--border-subtle)] py-1.5">
              <dt className="text-[var(--text-secondary)]">Network ID</dt>
              <dd className="font-mono">{selected.id}</dd>
            </div>
            <div className="flex justify-between border-b border-[var(--border-subtle)] py-1.5">
              <dt className="text-[var(--text-secondary)]">Routing mode</dt>
              <dd className="capitalize">{selected.routingMode}</dd>
            </div>
            <div className="flex justify-between border-b border-[var(--border-subtle)] py-1.5">
              <dt className="text-[var(--text-secondary)]">Subnets</dt>
              <dd className="font-mono">{state.subnets.filter((s) => s.vpcId === selected.id).length}</dd>
            </div>
            <div className="flex justify-between border-b border-[var(--border-subtle)] py-1.5">
              <dt className="text-[var(--text-secondary)]">VMs</dt>
              <dd className="font-mono">{state.vms.filter((v) => v.vpcId === selected.id).length}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      <FormPanel
        open={panelOpen}
        title="Create VPC network"
        description="A custom-mode VPC gives you full control over subnetwork ranges and routes."
        onClose={() => setPanelOpen(false)}
        footer={
          <>
            <Button onClick={() => setPanelOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void submit()} disabled={name.trim().length === 0}>
              Create
            </Button>
          </>
        }
      >
        <Field label="Name" hint="Lowercase letters, digits and hyphens. Start with a letter." htmlFor="vpc-name">
          <input
            id="vpc-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-vpc"
          />
        </Field>
        <Field label="Dynamic routing mode" hint="Regional keeps routes inside a single region. Global allows cross-region subnets.">
          <select className={inputClass} value={routingMode} onChange={(e) => setRoutingMode(e.target.value as 'regional' | 'global')}>
            <option value="regional">Regional</option>
            <option value="global">Global</option>
          </select>
        </Field>
      </FormPanel>

      <FormPanel
        open={cascadeVpc !== null}
        title="This VPC still has resources"
        description="Deleting it requires removing everything inside. Tell us what to do."
        onClose={() => setCascadeVpc(null)}
        footer={
          <>
            <Button onClick={() => setCascadeVpc(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (cascadeVpc) void remove(cascadeVpc, true);
              }}
            >
              Delete with dependencies
            </Button>
          </>
        }
      >
        <p className="text-xs text-[var(--text-secondary)]">
          Subnets, VMs, disks, gateways, routes, load balancers and firewall policies inside this VPC will be
          deleted too. This cannot be undone.
        </p>
      </FormPanel>
    </div>
  );
};