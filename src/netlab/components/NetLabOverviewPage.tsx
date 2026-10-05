/**
 * Overview dashboard: simulation health, resource counts, recent events, and a
 * live topology preview.
 */

import React from 'react';
import { useNetLab } from '../NetLabContext';
import { Button, Callout, Card, StatusBadge } from './ui';
import { TopologyGraph } from './TopologyGraph';
import { formatTime } from './tables';

const StatCard: React.FC<{ label: string; value: number; hint?: string; onClick?: () => void }> = ({
  label,
  value,
  hint,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2.5 text-left transition-colors enabled:hover:bg-[var(--card-hover)] disabled:cursor-default"
  >
    <p className="text-2xl font-medium tabular-nums text-[var(--text-primary)]">{value}</p>
    <p className="text-xs text-[var(--text-secondary)]">{label}</p>
    {hint ? <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">{hint}</p> : null}
  </button>
);

export const NetLabOverviewPage: React.FC = () => {
  const { state, setActiveSection, loadSample, resetLab, storageAdapterName, speed, pending } = useNetLab();

  const running = state.vms.filter((v) => v.status === 'RUNNING').length;
  const usedAddresses = state.subnets.reduce((sum, s) => sum + s.usedIps.length, 0);
  const blocked = state.traces.filter((t) => t.result.verdict === 'BLOCKED').length;
  const allowed = state.traces.length - blocked;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Networking lab</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            A pure simulation of GCP VPC networking. Nothing here touches a real network: every packet trace is a
            function over your simulated state.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void loadSample()}>Load sample network</Button>
          <Button variant="primary" onClick={() => setActiveSection('netlab-guided')}>
            Start guided lab
          </Button>
        </div>
      </header>

      {pending.length > 0 ? (
        <Callout tone="info" title="Simulating lifecycle transitions">
          {pending.map((p) => `${p.kind}: ${p.phase}`).join(' · ')}
        </Callout>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="VPC networks" value={state.vpcs.length} onClick={() => setActiveSection('netlab-vpc')} />
        <StatCard label="Subnetworks" value={state.subnets.length} onClick={() => setActiveSection('netlab-subnets')} />
        <StatCard label="VM instances" value={state.vms.length} hint={`${running} running`} onClick={() => setActiveSection('netlab-vms')} />
        <StatCard label="Load balancers" value={state.loadBalancers.length} onClick={() => setActiveSection('netlab-loadbalancers')} />
        <StatCard label="Firewall policies" value={state.nsgs.length} hint={`${state.nsgs.reduce((n, p) => n + p.rules.length, 0)} rules`} onClick={() => setActiveSection('netlab-firewall')} />
        <StatCard label="IPs in use" value={usedAddresses} hint={`${state.traces.length} packets traced`} onClick={() => setActiveSection('netlab-topology')} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card title="Topology">
          <TopologyGraph />
        </Card>

        <div className="space-y-4">
          <Card title="Simulation">
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Mode</dt>
                <dd className="font-mono text-[var(--text-primary)]">simulation-only</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Persistence</dt>
                <dd className="font-mono text-[var(--text-primary)]">{storageAdapterName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Speed</dt>
                <dd className="font-mono text-[var(--text-primary)]">{speed}×</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Docker execution</dt>
                <dd className="font-mono text-[var(--text-primary)]">disabled</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Packets allowed / blocked</dt>
                <dd className="font-mono text-[var(--text-primary)]">
                  {allowed} / {blocked}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Activity log" action={<StatusBadge status={state.events.some((e) => e.result === 'FAILED') ? 'DELETING' : 'RUNNING'} />}>
            {state.events.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)]">No activity yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {state.events.slice(0, 8).map((event) => (
                  <li key={event.id} className="border-b border-[var(--border-subtle)] pb-1.5 text-[11px] last:border-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-mono text-[var(--text-primary)]">{event.action}</span>
                      <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{formatTime(event.timestamp)}</span>
                    </div>
                    <p className="truncate text-[var(--text-secondary)]">
                      <span className={event.result === 'FAILED' ? 'text-[var(--danger)]' : 'text-[var(--success)]'}>{event.result}</span>
                      {' · '}
                      {event.resource}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Danger zone">
            <p className="mb-2 text-xs text-[var(--text-secondary)]">
              Reset removes every resource in the lab. Export first if you want to keep it.
            </p>
            <Button variant="danger" size="sm" onClick={() => void resetLab()}>
              Reset lab
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};