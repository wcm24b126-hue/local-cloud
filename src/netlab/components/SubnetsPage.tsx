/**
 * Subnetworks page: list, create with CIDR validation feedback, delete.
 */

import React, { useState } from 'react';
import { useNetLab } from '../NetLabContext';
import { Button, Callout, Field, StatusBadge, inputClass } from './ui';
import { Column, DataTable, FormPanel, formatTime } from './tables';
import { Subnet } from '../../sim/types';
import { formatIpv4, gatewayAddress, isValidSubnetCidr, parseCidr, usableRange } from '../../sim/ip';

export const SubnetsPage: React.FC = () => {
  const { state, pending, createSubnetResource, removeSubnet } = useNetLab();
  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState('');
  const [vpcId, setVpcId] = useState('');
  const [cidr, setCidr] = useState('10.0.1.0/24');
  const [region, setRegion] = useState('us-central1');
  const [allowPublicRange, setAllowPublicRange] = useState(false);

  const isPending = pending.some((p) => p.kind === 'Subnet');
  const effectiveVpcId = vpcId || state.vpcs[0]?.id || '';

  // Live validation so the learner sees the problem before submitting.
  const block = parseCidr(cidr);
  const usable = block ? usableRange(cidr) : null;
  const prefixOk = isValidSubnetCidr(cidr);

  const submit = async () => {
    const ok = await createSubnetResource({ name, vpcId: effectiveVpcId, cidr, region, allowPublicRange });
    if (ok) {
      setName('');
      setPanelOpen(false);
    }
  };

  const columns: Column<Subnet>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'vpc',
      header: 'VPC network',
      render: (row) => state.vpcs.find((v) => v.id === row.vpcId)?.name ?? '-',
    },
    { key: 'region', header: 'Region', render: (row) => <span className="font-mono text-[11px]">{row.region}</span> },
    {
      key: 'cidr',
      header: 'IP address range',
      render: (row) => <span className="font-mono text-[11px] tabular-nums">{row.cidr}</span>,
    },
    {
      key: 'gateway',
      header: 'Gateway',
      render: (row) => <span className="font-mono text-[11px] tabular-nums">{row.gatewayIp}</span>,
    },
    {
      key: 'used',
      header: 'In use',
      numeric: true,
      render: (row) => `${row.usedIps.length}/${usableRange(row.cidr) ? (usableRange(row.cidr)!.last - usableRange(row.cidr)!.first + 1) : 0}`,
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'action',
      header: '',
      render: (row) => (
        <Button size="sm" variant="danger" onClick={() => void removeSubnet(row.id)}>
          Delete
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Subnetworks</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Each subnet reserves the first two and last addresses of its range, exactly like GCP. VM internal IPs
            are allocated from the first free usable address.
          </p>
        </div>
        <Button variant="primary" onClick={() => setPanelOpen(true)} disabled={state.vpcs.length === 0}>
          Create subnet
        </Button>
      </header>

      {state.vpcs.length === 0 ? (
        <Callout tone="info" title="Create a VPC network first">
          Subnetworks must live inside a VPC network. Go to VPC networks and create one, then come back.
        </Callout>
      ) : null}

      <DataTable
        columns={columns}
        rows={state.subnets}
        isPending={isPending}
        pendingLabel="Creating subnet…"
        emptyTitle="No subnetworks yet"
        emptyMessage="Create at least one subnet so you can place VM instances inside it."
      />

      <FormPanel
        open={panelOpen}
        title="Create subnet"
        description="Ranges must be RFC 1918 private space, between /8 and /29, and must not overlap an existing subnet."
        onClose={() => setPanelOpen(false)}
        footer={
          <>
            <Button onClick={() => setPanelOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => void submit()}
              disabled={name.trim().length === 0 || !prefixOk || effectiveVpcId.length === 0}
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="subnet-name">
          <input
            id="subnet-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="web-subnet"
          />
        </Field>

        <Field label="VPC network" htmlFor="subnet-vpc">
          <select id="subnet-vpc" className={inputClass} value={effectiveVpcId} onChange={(e) => setVpcId(e.target.value)}>
            {state.vpcs.map((vpc) => (
              <option key={vpc.id} value={vpc.id}>
                {vpc.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Region" htmlFor="subnet-region">
          <select id="subnet-region" className={inputClass} value={region} onChange={(e) => setRegion(e.target.value)}>
            {['us-central1', 'us-east1', 'europe-west1', 'asia-east1'].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="IP address range"
          hint={prefixOk ? 'Valid CIDR.' : 'Must be a valid CIDR with a prefix between /8 and /29.'}
          htmlFor="subnet-cidr"
        >
          <input id="subnet-cidr" className={inputClass} value={cidr} onChange={(e) => setCidr(e.target.value)} />
        </Field>

        {prefixOk && usable ? (
          <Callout tone="info">
            Gateway <span className="font-mono">{block ? formatGateway(cidr) : ''}</span> ·{' '}
            <span className="font-mono">{usable.last - usable.first + 1}</span> usable addresses · first VM will get{' '}
            <span className="font-mono">{formatFirst(cidr)}</span>
          </Callout>
        ) : null}

        <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={allowPublicRange}
            onChange={(e) => setAllowPublicRange(e.target.checked)}
            className="mt-0.5"
          />
          <span>Allow a public IP range. Off by default so learners do not accidentally expose a subnet.</span>
        </label>
      </FormPanel>
    </div>
  );
}

function formatGateway(cidr: string): string {
  return gatewayAddress(cidr) ?? '-';
}

function formatFirst(cidr: string): string {
  const range = usableRange(cidr);
  if (!range) return '-';
  return formatIpv4(range.first);
}