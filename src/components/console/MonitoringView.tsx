import React, { useMemo, useState } from 'react';
import { Activity, Plus, Trash2, Bell, BellOff, Play } from 'lucide-react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Card, Button, Field, inputClass, EmptyState, Callout, StatusBadge } from '../../netlab/components/ui';
import { DataTable, FormPanel, formatTime, type Column } from '../../netlab/components/tables';
import { deriveMetrics, evaluatePolicies, METRIC_LABELS } from '../../sim/monitoring';
import type { TargetMetric } from '../../sim/monitoring';
import type { AlertPolicy, UptimeCheck } from '../../sim/types';

type Tab = 'overview' | 'policies' | 'uptime';

/** Small horizontal bar so utilisation reads without a charting library. */
const Meter: React.FC<{ value: number; tone?: 'ok' | 'warn' | 'bad' }> = ({ value, tone }) => {
  const clamped = Math.max(0, Math.min(100, value));
  const color =
    tone === 'bad' ? 'bg-[var(--danger)]' : tone === 'warn' ? 'bg-[var(--accent-amber)]' : 'bg-[var(--accent-blue)]';
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--border-subtle)]">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
      </span>
      <span className="font-mono text-[11px]">{clamped.toFixed(1)}%</span>
    </span>
  );
};

export const MonitoringView: React.FC<{ tab?: Tab }> = ({ tab: initialTab = 'overview' }) => {
  const lab = useNetLab();
  const { state } = lab;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [policyPanel, setPolicyPanel] = useState(false);
  const [checkPanel, setCheckPanel] = useState(false);
  const [policyName, setPolicyName] = useState('');
  const [metric, setMetric] = useState<AlertPolicy['metric']>('cpu.utilization');
  const [targetId, setTargetId] = useState('');
  const [threshold, setThreshold] = useState(80);
  const [duration, setDuration] = useState(60);
  const [severity, setSeverity] = useState<AlertPolicy['severity']>('WARNING');
  const [checkName, setCheckName] = useState('');
  const [url, setUrl] = useState('http://');
  const [period, setPeriod] = useState(60);

  const metrics = useMemo(() => deriveMetrics(state), [state]);
  const evaluations = useMemo(() => evaluatePolicies(state), [state]);
  const firingCount = evaluations.filter((e) => e.firing).length;

  const metricColumns: Column<TargetMetric>[] = [
    { key: 'name', header: 'Resource', render: (m) => <span className="font-mono text-xs">{m.name}</span> },
    { key: 'kind', header: 'Type', render: (m) => m.kind },
    { key: 'cpu', header: 'CPU', render: (m) => <Meter value={m.cpuUtilization} /> },
    { key: 'memory', header: 'Memory', render: (m) => <Meter value={m.memoryUtilization} /> },
    { key: 'used', header: 'Used', render: (m) => <Meter value={m.usedFraction} /> },
    {
      key: 'backends',
      header: 'Healthy backends',
      render: (m) => (m.totalBackends === 0 ? '-' : `${m.healthyBackends}/${m.totalBackends}`),
    },
    { key: 'net', header: 'Network', render: (m) => `${(m.bytesSentPerSecond / 1000).toFixed(0)} kB/s` },
  ];

  const policyColumns: Column<AlertPolicy>[] = [
    { key: 'name', header: 'Policy', render: (p) => <span className="font-mono text-xs">{p.name}</span> },
    { key: 'metric', header: 'Condition', render: (p) => `${METRIC_LABELS[p.metric]} > ${p.threshold}` },
    {
      key: 'duration',
      header: 'For',
      render: (p) => `${p.durationSeconds >= 60 ? `${p.durationSeconds / 60} min` : `${p.durationSeconds}s`}`,
    },
    { key: 'severity', header: 'Severity', render: (p) => <StatusBadge status={p.severity} /> },
    {
      key: 'state',
      header: 'Now',
      render: (p) => {
        const evaluation = evaluations.find((e) => e.policy.id === p.id);
        if (!p.enabled) return <span className="text-[11px] text-[var(--text-muted)]">Disabled</span>;
        return evaluation?.firing ? (
          <span className="text-[11px] text-[var(--danger)]">Firing ({evaluation.value})</span>
        ) : (
          <span className="text-[11px] text-[var(--text-secondary)]">OK ({evaluation?.value ?? 0})</span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" onClick={() => void lab.setAlertPolicyEnabled(p.id, !p.enabled)} title={p.enabled ? 'Disable' : 'Enable'}>
            {p.enabled ? <BellOff size={11} /> : <Bell size={11} />}
          </Button>
          <Button size="sm" variant="danger" onClick={() => void lab.deleteAlertPolicy(p.id)}>
            <Trash2 size={11} />
          </Button>
        </div>
      ),
    },
  ];

  const checkColumns: Column<UptimeCheck>[] = [
    { key: 'name', header: 'Check', render: (c) => <span className="font-mono text-xs">{c.name}</span> },
    { key: 'url', header: 'URL', render: (c) => <span className="font-mono text-[11px]">{c.url}</span> },
    { key: 'state', header: 'Status', render: (c) => <StatusBadge status={c.state} /> },
    { key: 'rate', header: 'Success rate', render: (c) => `${c.successRate}%` },
    { key: 'latency', header: 'Latency', render: (c) => (c.latencyMs > 0 ? `${c.latencyMs} ms` : '-') },
    { key: 'last', header: 'Last check', render: (c) => (c.lastCheckAt ? formatTime(c.lastCheckAt) : 'never') },
    {
      key: 'actions',
      header: '',
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" onClick={() => void lab.runUptimeCheck(c.id)}>
            <Play size={11} /> Run
          </Button>
          <Button size="sm" variant="danger" onClick={() => void lab.deleteUptimeCheck(c.id)}>
            <Trash2 size={11} />
          </Button>
        </div>
      ),
    },
  ];

  const submitPolicy = async () => {
    if (await lab.createAlertPolicy({
      name: policyName.trim(),
      targetId: targetId || undefined,
      metric,
      threshold,
      durationSeconds: duration,
      severity,
    })) {
      setPolicyPanel(false);
      setPolicyName('');
    }
  };

  const submitCheck = async () => {
    if (await lab.createUptimeCheck({ name: checkName.trim(), url: url.trim(), periodSeconds: period })) {
      setCheckPanel(false);
      setCheckName('');
      setUrl('http://');
    }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Metrics' },
    { id: 'policies', label: 'Alert policies' },
    { id: 'uptime', label: 'Uptime checks' },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-medium text-[var(--text-primary)]">
            <Activity size={18} /> Cloud Monitoring
          </h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Metrics are derived from the lab itself, so stopping a VM really does drop its utilisation to zero.
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'uptime' ? (
            <Button variant="primary" onClick={() => setCheckPanel(true)}>
              <Plus size={14} /> Create check
            </Button>
          ) : tab === 'policies' ? (
            <Button variant="primary" onClick={() => setPolicyPanel(true)}>
              <Plus size={14} /> Create policy
            </Button>
          ) : null}
        </div>
      </header>

      {firingCount > 0 ? (
        <Callout tone="error" title={`${firingCount} alert ${firingCount === 1 ? 'policy is' : 'policies are'} firing`}>
          A policy fires when its metric reaches the threshold. Disable one to stop notifications without deleting it.
        </Callout>
      ) : null}

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
        <Card title="Resource metrics">
          <DataTable
            columns={metricColumns}
            rows={metrics}
            emptyTitle="No resources to monitor"
            emptyMessage="Create a VM, load balancer, cluster, disk or Cloud SQL instance and its metrics appear here."
          />
        </Card>
      ) : null}

      {tab === 'policies' ? (
        <Card title="Alert policies">
          <DataTable
            columns={policyColumns}
            rows={state.alertPolicies}
            emptyTitle="No alert policies"
            emptyMessage="Create a policy to be told when a metric crosses a threshold."
            emptyAction={
              <Button size="sm" onClick={() => setPolicyPanel(true)}>
                <Plus size={12} /> Create policy
              </Button>
            }
          />
        </Card>
      ) : null}

      {tab === 'uptime' ? (
        <Card title="Uptime checks">
          <DataTable
            columns={checkColumns}
            rows={state.uptimeChecks}
            emptyTitle="No uptime checks"
            emptyMessage="Point a check at a load balancer address. It only reports UP while a healthy backend exists."
            emptyAction={
              <Button size="sm" onClick={() => setCheckPanel(true)}>
                <Plus size={12} /> Create check
              </Button>
            }
          />
        </Card>
      ) : null}

      {!state.vms.length && !state.loadBalancers.length && !state.k8sClusters.length && !state.sqlInstances.length ? (
        <EmptyState
          title="Nothing is running yet"
          message="Build the networking lab or the Kubernetes ERP from the Labs section, then come back to see live metrics."
        />
      ) : null}

      <FormPanel
        open={policyPanel}
        title="Create an alert policy"
        onClose={() => setPolicyPanel(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPolicyPanel(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!policyName.trim()} onClick={() => void submitPolicy()}>
              Create
            </Button>
          </div>
        }
      >
        <Field label="Policy name">
          <input className={inputClass} value={policyName} onChange={(e) => setPolicyName(e.target.value)} placeholder="high-cpu" />
        </Field>
        <Field label="Resource" hint="Leave on Any resource to watch every target of the chosen type.">
          <select className={inputClass} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Any resource</option>
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.kind})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Metric">
          <select className={inputClass} value={metric} onChange={(e) => setMetric(e.target.value as AlertPolicy['metric'])}>
            {Object.entries(METRIC_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Threshold (%)">
          <input type="number" min={0} max={100} className={inputClass} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </Field>
        <Field label="Must breach for (seconds)" hint="A short spike that clears quickly would never page anyone.">
          <input type="number" min={0} className={inputClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </Field>
        <Field label="Severity">
          <select className={inputClass} value={severity} onChange={(e) => setSeverity(e.target.value as AlertPolicy['severity'])}>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </Field>
      </FormPanel>

      <FormPanel
        open={checkPanel}
        title="Create an uptime check"
        onClose={() => setCheckPanel(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCheckPanel(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!checkName.trim() || url.length < 8} onClick={() => void submitCheck()}>
              Create
            </Button>
          </div>
        }
      >
        <Field label="Check ID">
          <input className={inputClass} value={checkName} onChange={(e) => setCheckName(e.target.value)} placeholder="web-endpoint" />
        </Field>
        <Field label="URL" hint="Use a load balancer address from the Load balancing tab.">
          <input className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://35.190.0.1/" />
        </Field>
        <Field label="Check period (seconds)" hint="The minimum is 60 seconds.">
          <input type="number" min={60} className={inputClass} value={period} onChange={(e) => setPeriod(Number(e.target.value))} />
        </Field>
      </FormPanel>
    </div>
  );
};

export const MonitoringMetricsTab: React.FC = () => <MonitoringView tab="overview" />;
export const MonitoringAlertingTab: React.FC = () => <MonitoringView tab="policies" />;
export const MonitoringUptimeTab: React.FC = () => <MonitoringView tab="uptime" />;
