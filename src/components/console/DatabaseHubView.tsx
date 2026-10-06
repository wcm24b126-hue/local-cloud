import React, { useState } from 'react';
import { HardDrive, ArrowRightLeft, Plug } from 'lucide-react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Card, Button, StatusBadge, MetaRow } from '../../netlab/components/ui';
import { DataTable, formatTime, type Column } from '../../netlab/components/tables';
import { ENGINE_LABELS, SQL_ENGINES, isAlloydb } from '../../sim/cloudSql';
import type { SqlInstance } from '../../sim/types';

type Tab = 'overview' | 'migration';

/**
 * "Databases" in the nav is a hub over the Cloud SQL and AlloyDB instances that
 * already exist in the lab, plus a migration view that reports connectivity
 * derived from the instance state rather than pretending to move data.
 */
export const DatabaseHubView: React.FC<{ tab?: Tab }> = ({ tab: initialTab = 'overview' }) => {
  const { state } = useNetLab();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [checks, setChecks] = useState<Record<string, { at: string; ok: boolean; note: string }>>({});

  const instances = state.sqlInstances;

  const instanceColumns: Column<SqlInstance>[] = [
    { key: 'name', header: 'Instance', render: (i) => <span className="font-mono text-xs">{i.name}</span> },
    {
      key: 'product',
      header: 'Product',
      render: (i) => (isAlloydb(i.engine) ? 'AlloyDB' : 'Cloud SQL'),
    },
    { key: 'engine', header: 'Engine', render: (i) => ENGINE_LABELS[i.engine] ?? i.engine },
    { key: 'tier', header: 'Tier', render: (i) => i.tier },
    { key: 'region', header: 'Region', render: (i) => i.region },
    {
      key: 'endpoint',
      header: 'Endpoint',
      render: (i) => <span className="font-mono text-[11px]">{i.publicIp ?? i.privateIp}</span>,
    },
    { key: 'state', header: 'Status', render: (i) => <StatusBadge status={i.state} /> },
    { key: 'created', header: 'Created', render: (i) => formatTime(i.createdAt) },
  ];

  const testConnection = (instance: SqlInstance) => {
    const running = instance.state === 'RUNNABLE';
    const note = !running
      ? `Instance is ${instance.state}, so the connection would fail.`
      : instance.publicIp
        ? `Reachable at ${instance.publicIp} over the public internet.`
        : `Private only at ${instance.privateIp}; reachable through VPC peering or a private service connect.`;
    setChecks((prev) => ({ ...prev, [instance.id]: { at: new Date().toISOString(), ok: running, note } }));
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'migration', label: 'Database Migration Service' },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-medium text-[var(--text-primary)]">
          <HardDrive size={18} /> Databases
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Every Cloud SQL and AlloyDB instance in this project, in one place.
        </p>
      </header>

      <div className="flex gap-1 border-b border-[var(--border-subtle)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-xs font-medium ${
              tab === t.id
                ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Card>
              <MetaRow label="Instances" value={String(instances.length)} />
            </Card>
            <Card>
              <MetaRow label="Cloud SQL" value={String(instances.filter((i) => !isAlloydb(i.engine)).length)} />
            </Card>
            <Card>
              <MetaRow label="AlloyDB" value={String(instances.filter((i) => isAlloydb(i.engine)).length)} />
            </Card>
            <Card>
              <MetaRow label="Publicly reachable" value={String(instances.filter((i) => !!i.publicIp).length)} />
            </Card>
          </div>

          <Card title="All instances">
            <DataTable
              columns={instanceColumns}
              rows={instances}
              emptyTitle="No database instances"
              emptyMessage="Create one from the Cloud SQL page to see it in this hub."
            />
          </Card>

          {instances.length > 0 ? (
            <Card title="Engine coverage">
              <div className="flex flex-wrap gap-2">
                {SQL_ENGINES.map((engine) => {
                  const count = instances.filter((i) => i.engine === engine).length;
                  return (
                    <span
                      key={engine}
                      className={`rounded border px-2 py-1 text-[11px] ${
                        count > 0
                          ? 'border-[var(--accent-blue-border)] bg-[var(--accent-blue-bg)] text-[var(--accent-blue)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                      }`}
                    >
                      {ENGINE_LABELS[engine]} &middot; {count}
                    </span>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'migration' ? (
        <Card
          title="Migration sources and targets"
          action={
            <Button size="sm">
              <ArrowRightLeft size={12} /> Start migration
            </Button>
          }
        >
          <p className="mb-3 text-xs text-[var(--text-secondary)]">
            A real DMS setup copies data between a source and a target and then keeps them in sync. This emulator cannot
            move rows, but it can tell you whether each instance would accept a connection right now, which is the
            first thing a migration needs.
          </p>
          {instances.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-color)] p-8 text-center">
              <p className="text-sm text-[var(--text-primary)]">No instances to migrate</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Create a Cloud SQL or AlloyDB instance first.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {instances.map((i) => {
                const check = checks[i.id];
                return (
                  <div key={i.id} className="rounded border border-[var(--border-color)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-[var(--text-primary)]">{i.name}</span>
                          <StatusBadge status={i.state} />
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            {ENGINE_LABELS[i.engine]} &middot; {i.tier} &middot; {i.region}
                          </span>
                        </div>
                        {check ? (
                          <p className={`mt-1 text-[11px] ${check.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                            {check.note} <span className="text-[var(--text-muted)]">({formatTime(check.at)})</span>
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                            Endpoint: <span className="font-mono">{i.publicIp ?? i.privateIp}</span>
                          </p>
                        )}
                      </div>
                      <Button size="sm" onClick={() => testConnection(i)}>
                        <Plug size={12} /> Test connection
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
};

export const DatabaseMigrationTab: React.FC = () => <DatabaseHubView tab="migration" />;