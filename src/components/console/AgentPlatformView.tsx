import React, { useMemo, useState } from 'react';
import { Bot, Workflow, Wrench, PlayCircle } from 'lucide-react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Card, Button, Callout, StatusBadge, MetaRow } from '../../netlab/components/ui';
import { DataTable, type Column } from '../../netlab/components/tables';

type Tab = 'studio' | 'playbooks' | 'tools';

/**
 * Agent Platform is a catalogue page rather than a simulator: there is no
 * agent runtime to model, but the resources an agent would act on are real, so
 * the page reports live counts from the lab instead of invented numbers.
 */
export const AgentPlatformView: React.FC<{ tab?: Tab }> = ({ tab: initialTab = 'studio' }) => {
  const { state } = useNetLab();
  const [tab, setTab] = useState<Tab>(initialTab);

  const counts = useMemo(
    () => ({
      tools: state.vms.length + state.k8sDeployments.length + state.sqlInstances.length,
      runnable: state.vms.filter((v) => v.status === 'RUNNING').length + state.k8sClusters.length,
      secrets: state.k8sSecrets.length + state.kmsKeys.length,
    }),
    [state]
  );

  const agents: { id: string; name: string; model: string; tools: string; status: string; scope: string }[] = [
    {
      id: 'agent-cost',
      name: 'cost-reviewer',
      model: 'localcloud-sim-1',
      tools: 'billing.export, bigquery.query',
      status: 'READY',
      scope: 'project',
    },
    {
      id: 'agent-remediation',
      name: 'security-remediator',
      model: 'localcloud-sim-2',
      tools: 'compute.instances.stop, firewall.update',
      status: 'READY',
      scope: 'organization',
    },
    {
      id: 'agent-sre',
      name: 'oncall-triage',
      model: 'localcloud-sim-1',
      tools: 'monitoring.metrics, logging.search',
      status: 'READY',
      scope: 'project',
    },
  ];
  const agentColumns: Column<(typeof agents)[number]>[] = [
    { key: 'name', header: 'Agent', render: (a) => <span className="font-mono text-xs">{a.name}</span> },
    { key: 'model', header: 'Model', render: (a) => <span className="font-mono text-[11px]">{a.model}</span> },
    { key: 'tools', header: 'Tools', render: (a) => <span className="text-[11px] text-[var(--text-secondary)]">{a.tools}</span> },
    { key: 'scope', header: 'Scope', render: (a) => a.scope },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
  ];

  const playbooks: { id: string; name: string; steps: string; trigger: string }[] = [
    { id: 'pb-scale-zero', name: 'scale-to-zero', steps: 'metrics.check → instances.stop → notify', trigger: 'cpu < 5% for 10m' },
    { id: 'pb-quarantine', name: 'quarantine-instance', steps: 'scc.list → compute.stop → tag.set', trigger: 'HIGH severity finding' },
    { id: 'pb-backup-check', name: 'verify-backups', steps: 'sql.list → backups.list → report', trigger: 'daily 02:00' },
  ];
  const playbookColumns: Column<(typeof playbooks)[number]>[] = [
    { key: 'name', header: 'Playbook', render: (p) => <span className="font-mono text-xs">{p.name}</span> },
    { key: 'steps', header: 'Steps', render: (p) => <span className="text-[11px] text-[var(--text-secondary)]">{p.steps}</span> },
    { key: 'trigger', header: 'Trigger', render: (p) => <span className="text-[11px]">{p.trigger}</span> },
  ];

  const tools: { id: string; name: string; kind: string; target: string }[] = [
    { id: 'tool-vm', name: 'compute.instances.list', kind: 'Read-only', target: `${state.vms.length} instance(s)` },
    { id: 'tool-k8s', name: 'k8s.deployments.scale', kind: 'Mutating', target: `${state.k8sDeployments.length} deployment(s)` },
    { id: 'tool-sql', name: 'sql.backups.create', kind: 'Mutating', target: `${state.sqlInstances.length} instance(s)` },
    { id: 'tool-kms', name: 'kms.cryptoKeys.list', kind: 'Read-only', target: `${state.kmsKeys.length} key(s)` },
  ];
  const toolColumns: Column<(typeof tools)[number]>[] = [
    { key: 'name', header: 'Tool', render: (t) => <span className="font-mono text-xs">{t.name}</span> },
    { key: 'kind', header: 'Access', render: (t) => t.kind },
    { key: 'target', header: 'Targets in this project', render: (t) => t.target },
  ];

  const TABS: { id: Tab; label: string }[] = [
    { id: 'studio', label: 'Agent studio' },
    { id: 'playbooks', label: 'Playbooks' },
    { id: 'tools', label: 'Tools' },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-medium text-[var(--text-primary)]">
          <Bot size={18} /> Agent Platform
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Agents and the tools they can call. The target counts below are read from your actual project resources.
        </p>
      </header>

      <Callout tone="info" title="Agents act on the same simulated resources">
        There is no agent runtime in this emulator, so nothing executes. What matters for learning is which resources a
        tool would reach and whether it is mutating.
      </Callout>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Callable targets', value: counts.tools },
          { label: 'Runnable resources', value: counts.runnable },
          { label: 'Secrets and keys', value: counts.secrets },
        ].map((c) => (
          <Card key={c.label}>
            <span className="block text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{c.label}</span>
            <span className="mt-1 block text-2xl font-medium text-[var(--text-primary)]">{c.value}</span>
          </Card>
        ))}
      </div>

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

      {tab === 'studio' ? (
        <Card title="Agents" action={<Button size="sm"><PlayCircle size={12} /> Create agent</Button>}>
          <DataTable columns={agentColumns} rows={agents} emptyTitle="No agents" emptyMessage="Create an agent to give it tools." />
        </Card>
      ) : null}

      {tab === 'playbooks' ? (
        <Card title="Playbooks" action={<Button size="sm"><Workflow size={12} /> Create playbook</Button>}>
          <DataTable columns={playbookColumns} rows={playbooks} emptyTitle="No playbooks" emptyMessage="A playbook chains tool calls behind a trigger." />
        </Card>
      ) : null}

      {tab === 'tools' ? (
        <Card title="Tools" action={<Button size="sm"><Wrench size={12} /> Connect tool</Button>}>
          <DataTable columns={toolColumns} rows={tools} emptyTitle="No tools" emptyMessage="Connect a tool to let an agent act on your resources." />
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1">
            <MetaRow label="Mutating tools" value={String(tools.filter((t) => t.kind === 'Mutating').length)} />
            <MetaRow label="Read-only tools" value={String(tools.filter((t) => t.kind === 'Read-only').length)} />
          </div>
        </Card>
      ) : null}
    </div>
  );
};

export const AgentStudioTab: React.FC = () => <AgentPlatformView tab="studio" />;
export const AgentPlaybooksTab: React.FC = () => <AgentPlatformView tab="playbooks" />;
export const AgentToolsTab: React.FC = () => <AgentPlatformView tab="tools" />;