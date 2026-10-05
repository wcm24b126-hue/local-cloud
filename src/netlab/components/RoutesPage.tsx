/**
 * Routes page: shows implicit and user-defined routes, plus internet gateway
 * management. Longest-prefix matching is called out here because it is the
 * single most common reason a learner is confused about a dropped packet.
 */

import React, { useState } from 'react';
import { useNetLab } from '../NetLabContext';
import { Button, Callout, Field, StatusBadge, inputClass } from './ui';
import { Column, DataTable, FormPanel, formatTime } from './tables';
import { Route } from '../../sim/types';
import { ipInCidr, isValidCidr } from '../../sim/ip';

const DEST_PRESETS = ['0.0.0.0/0'];

export const RoutesPage: React.FC = () => {
  const { state, pending, attachGateway, detachGateway, createRouteResource, removeRoute } = useNetLab();
  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState('');
  const [vpcId, setVpcId] = useState('');
  const [destCidr, setDestCidr] = useState(DEST_PRESETS[0]);
  const [nextHop, setNextHop] = useState<'local' | 'internet-gateway' | 'vm'>('internet-gateway');
  const [nextHopVm, setNextHopVm] = useState('');

  const isPending = pending.some((p) => p.kind === 'Internet gateway');
  const effectiveVpcId = vpcId || state.vpcs[0]?.id || '';
  const destValid = isValidCidr(destCidr);

  // Highlight which route a given destination would actually match.
  const [probe, setProbe] = useState('');
  const matching = probe && isValidCidr(destCidr) && /^[\d.]+$/.test(probe) ? state.routes.find((r) => ipInCidr(probe, r.destCidr)) : undefined;

  const submit = async () => {
    const ok = await createRouteResource({
      name,
      vpcId: effectiveVpcId,
      destCidr,
      nextHop,
      nextHopRefId: nextHop === 'vm' ? nextHopVm : undefined,
    });
    if (ok) {
      setName('');
      setPanelOpen(false);
    }
  };

  const columns: Column<Route>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <span className="font-medium">
          {row.name}
          {row.isImplicit ? (
            <span className="ml-2 rounded bg-[var(--bg-canvas)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
              implicit
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'vpc',
      header: 'VPC network',
      render: (row) => state.vpcs.find((v) => v.id === row.vpcId)?.name ?? '-',
    },
    {
      key: 'dest',
      header: 'Destination range',
      render: (row) => <span className="font-mono text-[11px] tabular-nums">{row.destCidr}</span>,
    },
    {
      key: 'nexthop',
      header: 'Next hop',
      render: (row) => {
        if (row.nextHop === 'local') return <span className="font-mono text-[11px]">local</span>;
        if (row.nextHop === 'internet-gateway') {
          const gw = state.gateways.find((g) => g.vpcId === row.vpcId);
          return <span className="font-mono text-[11px]">internet gateway{gw ? '' : ' (missing)'}</span>;
        }
        return (
          <span className="font-mono text-[11px]">
            VM {state.vms.find((v) => v.id === row.nextHopRefId)?.name ?? row.nextHopRefId ?? '-'}
          </span>
        );
      },
    },
    { key: 'priority', header: 'Priority', numeric: true, render: (row) => row.priority },
    {
      key: 'action',
      header: '',
      render: (row) =>
        row.isImplicit ? (
          <span className="text-[var(--text-muted)]">-</span>
        ) : (
          <Button size="sm" variant="danger" onClick={() => void removeRoute(row.id)}>
            Delete
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-medium text-[var(--text-primary)]">Routes</h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Every VPC gets implicit <span className="font-mono">local</span> routes for each subnet range. Add a
          <span className="font-mono"> 0.0.0.0/0</span> route pointing at an internet gateway to reach anything
          outside your network.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">Internet gateways</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {state.vpcs.map((vpc) => {
            const gw = state.gateways.find((g) => g.vpcId === vpc.id);
            return (
              <div
                key={vpc.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-[var(--text-primary)]">{vpc.name}</p>
                  <p className="truncate font-mono text-[10px] text-[var(--text-secondary)]">
                    {gw ? gw.name : 'No gateway attached'}
                  </p>
                </div>
                {gw ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={gw.status} />
                    <Button size="sm" onClick={() => void detachGateway(gw.id)}>
                      Detach
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => void attachGateway(`${vpc.name}-igw`, vpc.id)}>
                    Create and attach
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {state.vpcs.length === 0 ? <p className="text-xs text-[var(--text-secondary)]">Create a VPC network first.</p> : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Routes</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Longest prefix wins. A <span className="font-mono">10.0.1.0/24</span> route beats{' '}
              <span className="font-mono">0.0.0.0/0</span> for any address in that subnet.
            </p>
          </div>
          <Button variant="primary" onClick={() => setPanelOpen(true)} disabled={state.vpcs.length === 0}>
            Create route
          </Button>
        </div>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2.5">
          <Field label="Route tracer" hint="Type a destination IP to see which route the packet would take." htmlFor="route-probe">
            <input
              id="route-probe"
              className={inputClass}
              value={probe}
              onChange={(e) => setProbe(e.target.value)}
              placeholder="8.8.8.8"
            />
          </Field>
          {probe && /^\d+\.\d+\.\d+\.\d+$/.test(probe) ? (
            matching ? (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                <span className="font-mono text-[var(--text-primary)]">{probe}</span> matches{' '}
                <span className="font-mono text-[var(--text-primary)]">{matching.destCidr}</span> via{' '}
                <span className="font-mono text-[var(--text-primary)]">{matching.nextHop}</span>.
              </p>
            ) : (
              <p className="mt-2 text-xs text-[var(--danger)]">
                No route matches <span className="font-mono">{probe}</span>. The packet is dropped at the route table.
              </p>
            )
          ) : null}
        </div>

        <DataTable
          columns={columns}
          rows={state.routes}
          isPending={isPending}
          pendingLabel="Creating internet gateway…"
          emptyTitle="No routes"
          emptyMessage="Routes are created for you when you create a VPC network and its subnets."
        />
      </section>

      <FormPanel
        open={panelOpen}
        title="Create route"
        description="Give the destination a descriptive name. Overlapping ranges are allowed; priority decides."
        onClose={() => setPanelOpen(false)}
        footer={
          <>
            <Button onClick={() => setPanelOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => void submit()}
              disabled={name.trim().length === 0 || !destValid || (nextHop === 'vm' && !nextHopVm)}
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Route name" htmlFor="route-name">
          <input id="route-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="default-route-internet" />
        </Field>
        <Field label="VPC network" htmlFor="route-vpc">
          <select id="route-vpc" className={inputClass} value={effectiveVpcId} onChange={(e) => setVpcId(e.target.value)}>
            {state.vpcs.map((vpc) => (
              <option key={vpc.id} value={vpc.id}>
                {vpc.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Destination range"
          hint={destValid ? 'Valid CIDR.' : 'Enter a valid CIDR, for example 0.0.0.0/0.'}
          htmlFor="route-dest"
        >
          <input id="route-dest" className={inputClass} value={destCidr} onChange={(e) => setDestCidr(e.target.value)} />
        </Field>
        <Field label="Next hop" htmlFor="route-nexthop">
          <select
            id="route-nexthop"
            className={inputClass}
            value={nextHop}
            onChange={(e) => setNextHop(e.target.value as typeof nextHop)}
          >
            <option value="internet-gateway">Internet gateway</option>
            <option value="vm">External IP of a VM instance</option>
            <option value="local">Local subnet (deliver directly)</option>
          </select>
        </Field>
        {nextHop === 'vm' ? (
          <Field label="VM instance" hint="Only VMs with an external IP can act as a next hop." htmlFor="route-vm">
            <select id="route-vm" className={inputClass} value={nextHopVm} onChange={(e) => setNextHopVm(e.target.value)}>
              <option value="">Select a VM</option>
              {state.vms
                .filter((v) => v.externalIp)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.externalIp})
                  </option>
                ))}
            </select>
          </Field>
        ) : null}
        {nextHop === 'internet-gateway' && !state.gateways.some((g) => g.vpcId === effectiveVpcId) ? (
          <Callout tone="error" title="No internet gateway in this VPC">
            Create and attach one above, otherwise traffic on this route is dropped at the gateway.
          </Callout>
        ) : null}
      </FormPanel>
    </div>
  );
};