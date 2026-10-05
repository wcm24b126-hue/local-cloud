/**
 * Load balancing page: create external HTTP(S) and internal TCP load balancers,
 * then manage backend groups.
 *
 * The frontend IP is allocated the same way a VM internal IP is, so the LB
 * shows up in the tracer as a real endpoint in the subnet.
 */

import React, { useState } from 'react';
import { useNetLab } from '../NetLabContext';
import { Button, Callout, Field, StatusBadge, inputClass } from './ui';
import { Column, DataTable, FormPanel, formatTime } from './tables';
import { LoadBalancer } from '../../sim/types';

export const LoadBalancerPage: React.FC = () => {
  const { state, pending, createLoadBalancerResource, setLbBackends, removeLoadBalancer } = useNetLab();
  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'external-http' | 'internal-tcp'>('external-http');
  const [vpcId, setVpcId] = useState('');
  const [port, setPort] = useState('80');
  const [backends, setBackends] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftBackends, setDraftBackends] = useState<string[]>([]);

  const isPending = pending.some((p) => p.kind === 'Load balancer');
  const effectiveVpcId = vpcId || state.vpcs[0]?.id || '';
  const portNumber = Number(port);
  const eligibleVms = state.vms.filter((v) => v.status === 'RUNNING');

  const submit = async () => {
    const ok = await createLoadBalancerResource({
      name,
      type,
      vpcId: effectiveVpcId,
      port: portNumber,
      protocol: type === 'internal-tcp' ? 'tcp' : 'tcp',
      backendVmIds: backends,
    });
    if (ok) {
      setName('');
      setBackends([]);
      setPanelOpen(false);
    }
  };

  const columns: Column<LoadBalancer>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <span className="font-mono text-[11px]">{row.type}</span>,
    },
    {
      key: 'ip',
      header: 'Frontend IP',
      render: (row) => <span className="font-mono text-[11px] tabular-nums">{row.frontendIp}</span>,
    },
    {
      key: 'port',
      header: 'Port',
      numeric: true,
      render: (row) => row.port,
    },
    {
      key: 'vpc',
      header: 'VPC network',
      render: (row) => state.vpcs.find((v) => v.id === row.vpcId)?.name ?? '-',
    },
    {
      key: 'backends',
      header: 'Backends',
      render: (row) =>
        row.backendVmIds.length ? (
          <span className="font-mono text-[11px]">
            {row.backendVmIds.map((id) => state.vms.find((v) => v.id === id)?.name ?? '?').join(', ')}
          </span>
        ) : (
          <span className="text-[var(--danger)]">no healthy backends</span>
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
            onClick={() => {
              setEditing(row.id);
              setDraftBackends(row.backendVmIds);
            }}
          >
            Edit group
          </Button>
          <Button size="sm" variant="danger" onClick={() => void removeLoadBalancer(row.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const toggleBackend = (list: string[], id: string) =>
    list.includes(id) ? list.filter((v) => v !== id) : [...list, id];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Load balancing</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            An external HTTP load balancer needs a firewall rule that allows traffic on the frontend port. The tracer
            checks ingress at the backend VM with the load balancer IP as the source.
          </p>
        </div>
        <Button variant="primary" onClick={() => setPanelOpen(true)} disabled={state.vpcs.length === 0}>
          Create load balancer
        </Button>
      </header>

      <DataTable
        columns={columns}
        rows={state.loadBalancers}
        isPending={isPending}
        pendingLabel="Provisioning load balancer…"
        emptyTitle="No load balancers"
        emptyMessage="Create one to load balance traffic across several VM instances."
      />

      <FormPanel
        open={panelOpen}
        title="Create load balancer"
        description="The frontend IP is taken from the first usable address in the VPC's subnets."
        onClose={() => setPanelOpen(false)}
        footer={
          <>
            <Button onClick={() => setPanelOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => void submit()}
              disabled={name.trim().length === 0 || !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535}
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="lb-name">
          <input id="lb-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="web-lb" />
        </Field>
        <Field label="Type" hint="External HTTP(S) is internet facing. Internal TCP stays inside the VPC." htmlFor="lb-type">
          <select id="lb-type" className={inputClass} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="external-http">External HTTP(S)</option>
            <option value="internal-tcp">Internal TCP</option>
          </select>
        </Field>
        <Field label="VPC network" htmlFor="lb-vpc">
          <select id="lb-vpc" className={inputClass} value={effectiveVpcId} onChange={(e) => setVpcId(e.target.value)}>
            {state.vpcs.map((vpc) => (
              <option key={vpc.id} value={vpc.id}>
                {vpc.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Frontend port"
          hint="Port 80 for HTTP, 443 for HTTPS, or a TCP port for internal load balancing."
          error={!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535 ? 'Enter a port from 1 to 65535.' : undefined}
          htmlFor="lb-port"
        >
          <input id="lb-port" className={inputClass} value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
        </Field>

        <Field label="Backend group" hint="Only RUNNING VMs can be backends.">
          {eligibleVms.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">No RUNNING VMs available yet.</p>
          ) : (
            <div className="space-y-1">
              {eligibleVms.map((vm) => (
                <label key={vm.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={backends.includes(vm.id)}
                    onChange={() => setBackends((prev) => toggleBackend(prev, vm.id))}
                  />
                  <span className="font-mono">{vm.name}</span>
                  <span className="font-mono text-[var(--text-muted)]">{vm.internalIp}</span>
                </label>
              ))}
            </div>
          )}
        </Field>

        {type === 'external-http' && portNumber === 80 ? (
          <Callout tone="info">
            Remember: without an ingress rule allowing TCP port 80 from <span className="font-mono">0.0.0.0/0</span> on
            the backend subnet, the load balancer health check fails and every request is dropped.
          </Callout>
        ) : null}
      </FormPanel>

      <FormPanel
        open={editing !== null}
        title="Edit backend group"
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (editing) void setLbBackends(editing, draftBackends);
                setEditing(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {eligibleVms.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">No RUNNING VMs available.</p>
        ) : (
          <div className="space-y-1">
            {eligibleVms.map((vm) => (
              <label key={vm.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={draftBackends.includes(vm.id)}
                  onChange={() => setDraftBackends((prev) => toggleBackend(prev, vm.id))}
                />
                <span className="font-mono">{vm.name}</span>
                <span className="font-mono text-[var(--text-muted)]">{vm.internalIp}</span>
              </label>
            ))}
          </div>
        )}
      </FormPanel>
    </div>
  );
};