import React, { useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, ScanSearch } from 'lucide-react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Card, Button, EmptyState, Callout } from '../../netlab/components/ui';
import { DataTable, formatTime, type Column } from '../../netlab/components/tables';
import { deriveSecurityFindings, findingCounts } from '../../sim/security';
import type { SecurityFinding, FindingSeverity } from '../../sim/security';

type Tab = 'findings' | 'assets' | 'scans';

const SEVERITY_STYLE: Record<FindingSeverity, string> = {
  HIGH: 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/40',
  MEDIUM: 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border-[var(--accent-amber)]/40',
  LOW: 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-color)]',
};

export const SecurityView: React.FC<{ tab?: Tab }> = ({ tab: initialTab = 'findings' }) => {
  const lab = useNetLab();
  const { state } = lab;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [severity, setSeverity] = useState<FindingSeverity | 'ALL'>('ALL');

  const findings = useMemo(() => deriveSecurityFindings(state), [state]);
  const counts = useMemo(() => findingCounts(findings), [findings]);
  const shown = severity === 'ALL' ? findings : findings.filter((f) => f.severity === severity);

  const findingColumns: Column<SecurityFinding>[] = [
    {
      key: 'severity',
      header: 'Severity',
      render: (f) => (
        <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase ${SEVERITY_STYLE[f.severity]}`}>
          {f.severity}
        </span>
      ),
    },
    { key: 'title', header: 'Finding', render: (f) => <span className="text-xs text-[var(--text-primary)]">{f.title}</span> },
    { key: 'category', header: 'Category', render: (f) => f.category },
    { key: 'resource', header: 'Resource', render: (f) => <span className="font-mono text-[11px]">{f.resourceLabel}</span> },
  ];

  const assets = [
    ...state.vpcs.map((v) => ({ id: v.id, kind: 'VPC network', name: v.name, detail: `${v.routingMode} dynamic routing` })),
    ...state.vms.map((v) => ({ id: v.id, kind: 'VM instance', name: v.name, detail: `${v.internalIp}${v.externalIp ? `, external ${v.externalIp}` : ''}` })),
    ...state.nsgs.map((n) => ({ id: n.id, kind: 'Firewall policy', name: n.name, detail: `${n.rules.length} rule(s)` })),
    ...state.loadBalancers.map((l) => ({ id: l.id, kind: 'Load balancer', name: l.name, detail: `${l.frontendIp}:${l.port}` })),
    ...state.sqlInstances.map((s) => ({ id: s.id, kind: 'Cloud SQL', name: s.name, detail: s.publicIp ? `public ${s.publicIp}` : 'private IP' })),
    ...state.kmsKeys.map((k) => ({ id: k.id, kind: 'KMS key', name: k.name, detail: `${k.state}, ${k.purpose}` })),
  ];

  const assetColumns: Column<{ id: string; kind: string; name: string; detail: string }>[] = [
    { key: 'kind', header: 'Asset type', render: (a) => a.kind },
    { key: 'name', header: 'Name', render: (a) => <span className="font-mono text-xs">{a.name}</span> },
    { key: 'detail', header: 'Detail', render: (a) => <span className="font-mono text-[11px] text-[var(--text-secondary)]">{a.detail}</span> },
    {
      key: 'findings',
      header: 'Findings',
      render: (a) => String(findings.filter((f) => f.resourceId === a.id).length),
      numeric: true,
    },
  ];

  // A scan is a pass over current state, so its result equals the findings list.
  const scanRows = findings.map((f) => ({
    id: f.id,
    scannedAt: formatTime(new Date().toISOString()),
    category: f.category,
    result: f.severity === 'HIGH' ? 'Vulnerable' : 'Needs attention',
    finding: f.title,
  }));
  const scanColumns: Column<(typeof scanRows)[number]>[] = [
    { key: 'scannedAt', header: 'Scan time', render: (s) => s.scannedAt },
    { key: 'category', header: 'Category', render: (s) => s.category },
    { key: 'result', header: 'Result', render: (s) => s.result },
    { key: 'finding', header: 'Detail', render: (s) => <span className="text-xs">{s.finding}</span> },
  ];

  const TABS: { id: Tab; label: string }[] = [
    { id: 'findings', label: 'Findings' },
    { id: 'assets', label: 'Assets' },
    { id: 'scans', label: 'Scan results' },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-medium text-[var(--text-primary)]">
          <ShieldCheck size={18} /> Security Command Center
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Findings are recomputed from your resources on every render, so fixing a firewall rule genuinely clears the
          finding.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {(['HIGH', 'MEDIUM', 'LOW'] as FindingSeverity[]).map((level) => (
          <button
            key={level}
            onClick={() => setSeverity(severity === level ? 'ALL' : level)}
            className={`rounded-lg border px-4 py-3 text-left transition-colors ${
              severity === level ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-bg)]' : 'border-[var(--border-color)] bg-[var(--bg-surface)]'
            }`}
          >
            <span className="block text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{level}</span>
            <span className="mt-1 block text-2xl font-medium text-[var(--text-primary)]">{counts[level]}</span>
          </button>
        ))}
      </div>

      {counts.HIGH === 0 ? (
        <Callout tone="success" title="No high severity findings">
          Nothing is exposed to the whole internet right now. Create something risky in the networking lab and the
          matching finding appears here.
        </Callout>
      ) : (
        <Callout tone="error" title={`${counts.HIGH} high severity ${counts.HIGH === 1 ? 'finding' : 'findings'}`}>
          These expose a resource to 0.0.0.0/0. Tighten the source range or drop the rule.
        </Callout>
      )}

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

      {tab === 'findings' ? (
        findings.length === 0 ? (
          <EmptyState title="Nothing to report" message="Build a lab with a world-open firewall rule and it will show up here." />
        ) : (
          <div className="space-y-2">
            {shown.map((f) => (
              <Card key={f.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={14} className={f.severity === 'HIGH' ? 'text-[var(--danger)]' : 'text-[var(--accent-amber)]'} />
                      <span className="text-sm font-medium text-[var(--text-primary)]">{f.title}</span>
                      <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase ${SEVERITY_STYLE[f.severity]}`}>
                        {f.severity}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{f.description}</p>
                    <p className="mt-1.5 text-xs text-[var(--accent-blue)]">Recommendation: {f.recommendation}</p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      {f.category} &middot; <span className="font-mono">{f.resourceLabel}</span>
                      {f.relatedRules.length > 0 ? <> &middot; rules: {f.relatedRules.join(', ')}</> : null}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}

      {tab === 'assets' ? (
        <Card title="Protected assets">
          <DataTable
            columns={assetColumns}
            rows={assets}
            emptyTitle="No assets yet"
            emptyMessage="Create resources in the Labs section and they are inventoried here."
          />
        </Card>
      ) : null}

      {tab === 'scans' ? (
        <Card
          title="Container vulnerability scan"
          action={
            <Button size="sm" onClick={() => setTab('scans')}>
              <ScanSearch size={12} /> Rescan
            </Button>
          }
        >
          {scanRows.length === 0 ? (
            <EmptyState title="No scan results" message="There is nothing exposed, so a scan finds nothing. That is the good outcome." />
          ) : (
            <DataTable columns={scanColumns} rows={scanRows} emptyTitle="Clean" emptyMessage="No findings." />
          )}
        </Card>
      ) : null}
    </div>
  );
};

export const SecurityScansTab: React.FC = () => <SecurityView tab="scans" />;
export const SecurityAssetsTab: React.FC = () => <SecurityView tab="assets" />;
