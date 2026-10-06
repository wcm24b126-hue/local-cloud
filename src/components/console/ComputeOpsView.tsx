import React, { useState } from 'react';
import { Cpu, ScrollText, RefreshCw } from 'lucide-react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Card, Button, EmptyState, StatusBadge, MetaRow } from '../../netlab/components/ui';
import { DataTable, formatTime, type Column } from '../../netlab/components/tables';
import type { InstanceGroup, InstanceTemplate, Vm, EventLogEntry } from '../../sim/types';

type Tab = 'groups' | 'templates' | 'nodes' | 'operations';

/**
 * The Compute Engine views that do not fit the instance list. Everything shown
 * here is read from the same SimState the instance list uses, so the two views
 * can never disagree about what exists.
 */
export const ComputeOpsView: React.FC<{ tab?: Tab }> = ({ tab: initialTab = 'groups' }) => {
  const { state } = useNetLab();
  const [tab, setTab] = useState<Tab>(initialTab);

  const groupColumns: Column<InstanceGroup>[] = [
    { key: 'name', header: 'Name', render: (g) => <span className="font-mono text-xs">{g.name}</span> },
    {
      key: 'size',
      header: 'Size (min/max)',
      render: (g) => `${g.targetSize} (${g.minSize}-${g.maxSize})`,
      numeric: true,
    },
    {
      key: 'template',
      header: 'Template',
      render: (g) => (
        <span className="font-mono text-[11px]">
          {state.instanceTemplates.find((t) => t.id === g.templateId)?.name ?? '(deleted)'}
        </span>
      ),
    },
    { key: 'vms', header: 'Instances', render: (g) => String(g.vmIds.length), numeric: true },
    { key: 'status', header: 'Status', render: (g) => <StatusBadge status={g.status} /> },
    { key: 'created', header: 'Created', render: (g) => formatTime(g.createdAt) },
  ];

  const templateColumns: Column<InstanceTemplate>[] = [
    { key: 'name', header: 'Name', render: (t) => <span className="font-mono text-xs">{t.name}</span> },
    { key: 'machineType', header: 'Machine type', render: (t) => <span className="font-mono text-[11px]">{t.machineType}</span> },
    { key: 'zone', header: 'Zone', render: (t) => t.zone },
    { key: 'disk', header: 'Boot disk', render: (t) => `${t.bootDiskSizeGb} GiB` },
    { key: 'tags', header: 'Network tags', render: (t) => (t.networkTags.length ? t.networkTags.join(', ') : '-') },
    { key: 'created', header: 'Created', render: (t) => formatTime(t.createdAt) },
  ];

  const nodeColumns: Column<Vm>[] = [
    { key: 'name', header: 'Name', render: (v) => <span className="font-mono text-xs">{v.name}</span> },
    { key: 'zone', header: 'Zone', render: (v) => v.zone },
    { key: 'machineType', header: 'Machine type', render: (v) => <span className="font-mono text-[11px]">{v.machineType}</span> },
    { key: 'internal', header: 'Internal IP', render: (v) => <span className="font-mono text-[11px]">{v.internalIp}</span> },
    {
      key: 'external',
      header: 'External IP',
      render: (v) => <span className="font-mono text-[11px]">{v.externalIp ?? '-'}</span>,
    },
    { key: 'tags', header: 'Tags', render: (v) => (v.networkTags.length ? v.networkTags.join(', ') : '-') },
    { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.status} /> },
  ];

  const opColumns: Column<EventLogEntry>[] = [
    { key: 'timestamp', header: 'Time', render: (e) => formatTime(e.timestamp) },
    { key: 'actor', header: 'Actor', render: (e) => <span className="font-mono text-[11px]">{e.actor}</span> },
    { key: 'action', header: 'Operation', render: (e) => <span className="font-mono text-[11px]">{e.action}</span> },
    { key: 'resource', header: 'Resource', render: (e) => <span className="font-mono text-[11px]">{e.resource}</span> },
    { key: 'result', header: 'Status', render: (e) => <StatusBadge status={e.result} /> },
    { key: 'detail', header: 'Detail', render: (e) => <span className="text-[11px] text-[var(--text-secondary)]">{e.detail ?? '-'}</span> },
  ];

  const TABS: { id: Tab; label: string }[] = [
    { id: 'groups', label: 'Instance groups' },
    { id: 'templates', label: 'Instance templates' },
    { id: 'nodes', label: 'All nodes' },
    { id: 'operations', label: 'Operations' },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-medium text-[var(--text-primary)]">
          <Cpu size={18} /> Compute Engine
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Group, template and audit views over the same instances the VM Instances page manages.
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

      {tab === 'groups' ? (
        <Card title="Instance groups">
          <DataTable
            columns={groupColumns}
            rows={state.instanceGroups}
            emptyTitle="No instance groups"
            emptyMessage="Create a group from the Instance groups page in the Labs section to manage capacity as one unit."
          />
        </Card>
      ) : null}

      {tab === 'templates' ? (
        <Card title="Instance templates">
          <DataTable
            columns={templateColumns}
            rows={state.instanceTemplates}
            emptyTitle="No instance templates"
            emptyMessage="A template captures the settings for new instances so a group can scale without repeating them."
          />
        </Card>
      ) : null}

      {tab === 'nodes' ? (
        <Card title="All nodes">
          {state.vms.length === 0 ? (
            <EmptyState title="No instances" message="Create a VM instance to see it here." />
          ) : (
            <>
              <DataTable columns={nodeColumns} rows={state.vms} emptyTitle="No instances" emptyMessage="Nothing running yet." />
              <div className="mt-3 text-[11px] text-[var(--text-muted)]">
                {state.vms.length} instance(s) &middot;{' '}
                {state.vms.filter((v) => v.status === 'RUNNING').length} running &middot;{' '}
                {state.vms.filter((v) => v.externalIp).length} with an external address
              </div>
            </>
          )}
        </Card>
      ) : null}

      {tab === 'operations' ? (
        <Card title="Recent operations" action={<RefreshCw size={12} className="text-[var(--text-muted)]" />}>
          <DataTable
            columns={opColumns}
            rows={state.events}
            emptyTitle="No operations yet"
            emptyMessage="Every create, update and delete in the lab is recorded here with its actor and result."
          />
        </Card>
      ) : null}

      {state.vms.length === 0 && tab !== 'operations' ? (
        <EmptyState
          title="Nothing built yet"
          message="Open the Labs section and build a sample network to populate these views."
          action={
            <Button size="sm" onClick={() => setTab('operations')}>
              <ScrollText size={12} /> See operations
            </Button>
          }
        />
      ) : null}

      {tab === 'groups' && state.instanceGroups.length > 0 ? (
        <Card title="Group summary">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
            <MetaRow label="Groups" value={String(state.instanceGroups.length)} />
            <MetaRow label="Instances in groups" value={String(state.instanceGroups.reduce((s, g) => s + g.vmIds.length, 0))} />
            <MetaRow label="Templates" value={String(state.instanceTemplates.length)} />
            <MetaRow label="Events recorded" value={String(state.events.length)} />
          </div>
        </Card>
      ) : null}
    </div>
  );
};

export const ComputeGroupsTab: React.FC = () => <ComputeOpsView tab="groups" />;
export const ComputeTemplatesTab: React.FC = () => <ComputeOpsView tab="templates" />;
export const ComputeNodesTab: React.FC = () => <ComputeOpsView tab="nodes" />;
export const ComputeOperationsTab: React.FC = () => <ComputeOpsView tab="operations" />;
