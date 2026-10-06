import React, { useState } from 'react';
import {
  Database,
  Play,
  RotateCcw,
  Download,
  Copy,
  Check,
  Search,
  Table as TableIcon,
  ChevronRight,
  ChevronDown,
  Layers,
  Sparkles,
  Clock,
  Code2,
  FileSpreadsheet,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { useLocalCloud } from '../../../context/LocalCloudContext';
import { BigQueryDataset, BigQueryTable, BigQueryQueryResult } from '../../../types';

type BqPanel = 'studio' | 'datasets' | 'scheduled' | 'transfers';

export const BigQueryView: React.FC<{ panel?: BqPanel }> = ({ panel: initialPanel = 'studio' }) => {
  const {
    bqDatasets,
    selectedBqDataset,
    setSelectedBqDataset,
    selectedBqTable,
    setSelectedBqTable,
    bqQueryHistory,
    executeBigQuery,
    currentProject,
    showToast,
    buckets,
  } = useLocalCloud();

  const [panel, setPanel] = useState<BqPanel>(initialPanel);
  const [rerunResult, setRerunResult] = useState<BigQueryQueryResult | null>(null);

  const [sqlQuery, setSqlQuery] = useState(
    'SELECT service_description, sku_id, cost, currency\nFROM `billing_export.gcp_billing_export_v1`\nORDER BY cost DESC\nLIMIT 10;'
  );

  const [activeBottomTab, setActiveBottomTab] = useState<'results' | 'schema' | 'history'>('results');
  const [currentResult, setCurrentResult] = useState<BigQueryQueryResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedDatasets, setExpandedDatasets] = useState<Record<string, boolean>>({
    'ds-1': true,
    'ds-2': true,
  });

  const toggleDatasetExpand = (dsId: string) => {
    setExpandedDatasets(prev => ({ ...prev, [dsId]: !prev[dsId] }));
  };

  const handleRunQuery = () => {
    if (!sqlQuery.trim()) return;
    setIsRunning(true);
    setTimeout(() => {
      const result = executeBigQuery(sqlQuery);
      setCurrentResult(result);
      setActiveBottomTab('results');
      setIsRunning(false);
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRunQuery();
    }
  };

  const exportAsCsv = () => {
    if (!currentResult || currentResult.rows.length === 0) return;
    const header = currentResult.columns.join(',');
    const body = currentResult.rows.map(r => r.join(',')).join('\n');
    const csvContent = `data:text/csv;charset=utf-8,${encodeURIComponent(`${header}\n${body}`)}`;
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `bigquery_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported results to CSV');
  };

  const exportAsJson = () => {
    if (!currentResult || currentResult.rows.length === 0) return;
    const jsonRows = currentResult.rows.map(r => {
      const obj: Record<string, any> = {};
      currentResult.columns.forEach((col, idx) => {
        obj[col] = r[idx];
      });
      return obj;
    });
    const blob = new Blob([JSON.stringify(jsonRows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bigquery_results_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported results to JSON');
  };

  const runScheduled = (sql: string) => {
    const res = executeBigQuery(sql);
    setRerunResult(res);
    showToast(`Scheduled query ran: ${res.totalRows} row(s), ${res.bytesProcessed} bytes scanned`);
  };

  const PANEL_TABS: { id: BqPanel; label: string }[] = [
    { id: 'studio', label: 'Studio' },
    { id: 'datasets', label: 'Datasets & tables' },
    { id: 'scheduled', label: 'Scheduled queries' },
    { id: 'transfers', label: 'Data transfers' },
  ];

  const panelSwitch = (render: () => React.ReactNode) => (
    <div className="max-w-6xl mx-auto space-y-4 animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">BigQuery</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">
              Serverless Data Warehouse
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">{currentProject.name} &middot; {bqDatasets.length} dataset(s)</p>
        </div>
      </div>
      <div className="flex gap-1 border-b border-[var(--border-subtle)]">
        {PANEL_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setPanel(t.id)}
            className={`border-b-2 px-3 py-2 text-xs font-medium ${
              panel === t.id
                ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {render()}
    </div>
  );

  if (panel === 'datasets') {
    return panelSwitch(() =>
      bqDatasets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-color)] p-10 text-center">
          <p className="text-sm text-[var(--text-primary)]">No datasets in this project</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Open Studio and run a query to materialise the billing export.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bqDatasets.map((ds) => (
            <div key={ds.id} className="rounded-lg border border-[var(--border-color)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3 py-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-[var(--text-primary)]">{ds.name}</span>
                  <span className="ml-2 text-[11px] text-[var(--text-muted)]">{ds.location}</span>
                </div>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {ds.tables.length} table(s)
                </span>
              </div>
              {ds.tables.length > 0 ? (
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-canvas)] text-[var(--text-secondary)]">
                    <tr>
                      <th className="text-left font-medium px-3 py-1.5">Table</th>
                      <th className="text-right font-medium px-3 py-1.5">Rows</th>
                      <th className="text-right font-medium px-3 py-1.5">Size</th>
                      <th className="text-right font-medium px-3 py-1.5">Columns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ds.tables.map((t) => (
                      <tr key={t.id} className="border-t border-[var(--border-subtle)]">
                        <td className="px-3 py-1.5 font-mono text-[11px] text-[var(--text-primary)]">{t.name}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{t.rowCount.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{Math.round(t.sizeBytes / 1024)} KiB</td>
                        <td className="px-3 py-1.5 text-right font-mono">{t.columns.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-3 py-2 text-[11px] text-[var(--text-muted)]">No tables yet.</p>
              )}
            </div>
          ))}
        </div>
      )
    );
  }

  if (panel === 'scheduled') {
    return panelSwitch(() =>
      bqQueryHistory.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-color)] p-10 text-center">
          <p className="text-sm text-[var(--text-primary)]">No scheduled queries yet</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Run a query in Studio first; this emulator schedules the queries you have actually executed.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-[var(--border-color)] overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-canvas)] text-[var(--text-secondary)]">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Query</th>
                  <th className="text-left font-medium px-3 py-2">Last run</th>
                  <th className="text-right font-medium px-3 py-2">Rows</th>
                  <th className="text-right font-medium px-3 py-2">Bytes scanned</th>
                  <th className="text-right font-medium px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {bqQueryHistory.map((q, idx) => (
                  <tr key={idx} className="border-t border-[var(--border-subtle)]">
                    <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-primary)] max-w-md truncate">{q.query.replace(/\s+/g, ' ')}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{q.executionTimeMs} ms run</td>
                    <td className="px-3 py-2 text-right font-mono">{q.totalRows}</td>
                    <td className="px-3 py-2 text-right font-mono">{q.bytesProcessed}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => runScheduled(q.query)}
                        className="text-[var(--accent-blue)] hover:underline"
                      >
                        Run now
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rerunResult ? (
            <div className="rounded-lg border border-[var(--border-color)] p-3">
              <p className="text-xs font-medium text-[var(--text-primary)]">Last run returned {rerunResult.totalRows} row(s)</p>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-[var(--bg-canvas)] p-2 text-[11px] font-mono text-[var(--text-secondary)]">
                {rerunResult.rows.map((r) => r.join(' | ')).join('\n') || '(no rows)'}
              </pre>
            </div>
          ) : null}
        </>
      )
    );
  }

  if (panel === 'transfers') {
    return panelSwitch(() => (
      <>
        <p className="text-xs text-[var(--text-secondary)]">
          Transfers move data between Cloud Storage buckets and BigQuery datasets. These are your real buckets, so the
          job list is derived from what actually exists.
        </p>
        {buckets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border-color)] p-10 text-center">
            <p className="text-sm text-[var(--text-primary)]">No buckets to transfer from</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Create a bucket in Cloud Storage and it becomes a transfer endpoint.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--border-color)] overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-canvas)] text-[var(--text-secondary)]">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Source bucket</th>
                  <th className="text-left font-medium px-3 py-2">Location</th>
                  <th className="text-left font-medium px-3 py-2">Target dataset</th>
                  <th className="text-left font-medium px-3 py-2">Schedule</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b, idx) => (
                  <tr key={b.id} className="border-t border-[var(--border-subtle)]">
                    <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-primary)]">gs://{b.name}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{b.location}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{bqDatasets[idx % Math.max(bqDatasets.length, 1)]?.name ?? '(none)'}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">Daily 02:00 UTC</td>
                    <td className="px-3 py-2"><span className="text-[var(--success)]">ENABLED</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    ));
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              BigQuery Studio
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">
              Serverless Data Warehouse
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Query petabytes of structured and semi-structured datasets using standard ANSI SQL in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSqlQuery('SELECT * FROM `billing_export.gcp_billing_export_v1` LIMIT 20;');
            }}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Billing template
          </button>
          <button
            onClick={() => {
              setSqlQuery('SELECT path, count(*) as count, avg(latency_ms) as avg_latency\nFROM `app_telemetry.daily_traffic`\nGROUP BY path\nORDER BY count DESC;');
            }}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Telemetry template
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* LEFT EXPLORER PANEL (3 cols) */}
        <div className="md:col-span-3 border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] p-3 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
            <span className="font-semibold text-xs text-[var(--text-primary)] uppercase tracking-wider">
              Explorer
            </span>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {currentProject.projectId}
            </span>
          </div>

          <div className="space-y-1 text-xs">
            {bqDatasets.map(ds => {
              const isExpanded = expandedDatasets[ds.id];
              return (
                <div key={ds.id} className="space-y-1">
                  <div
                    onClick={() => toggleDatasetExpand(ds.id)}
                    className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-[var(--card-hover)] cursor-pointer select-none text-[var(--text-primary)] font-medium"
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                    <Database className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                    <span>{ds.name}</span>
                  </div>

                  {isExpanded && (
                    <div className="pl-6 space-y-1">
                      {ds.tables.map(tbl => (
                        <div
                          key={tbl.id}
                          onClick={() => {
                            setSelectedBqDataset(ds);
                            setSelectedBqTable(tbl);
                            setActiveBottomTab('schema');
                          }}
                          className={`flex items-center gap-1.5 p-1 rounded-md cursor-pointer text-[11px] font-mono transition-colors ${
                            selectedBqTable?.id === tbl.id
                              ? 'bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] font-bold'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--card-hover)]'
                          }`}
                        >
                          <TableIcon className="w-3 h-3 text-[var(--text-muted)]" />
                          <span>{tbl.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT EDITOR & RESULTS (9 cols) */}
        <div className="md:col-span-9 space-y-4">
          {/* Query Toolbar */}
          <div className="p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunQuery}
                  disabled={isRunning}
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                  <span>{isRunning ? 'Running...' : 'Run (Ctrl+Enter)'}</span>
                </button>

                <button
                  onClick={() => {
                    setSqlQuery(prev => prev.trim().replace(/\s+/g, ' '));
                    showToast('Formatted query');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Format
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Validator: Query will process 1.5 KB when run</span>
                </span>
              </div>
            </div>

            {/* SQL Query Editor */}
            <div className="relative">
              <textarea
                rows={6}
                value={sqlQuery}
                onChange={e => setSqlQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full p-3 rounded-xl bg-black text-neutral-200 font-mono text-xs border border-neutral-800 leading-relaxed focus:outline-none focus:border-[var(--accent-blue)] shadow-inner"
                placeholder="Write standard SQL query here..."
              />
            </div>
          </div>

          {/* Bottom Tabs: Results / Schema / History */}
          <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 text-xs">
              <div className="flex items-center gap-4">
                {[
                  { id: 'results', label: 'Query Results' },
                  { id: 'schema', label: 'Table Schema & Details' },
                  { id: 'history', label: 'Query History' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveBottomTab(tab.id as any)}
                    className={`font-semibold pb-1 border-b-2 transition-colors ${
                      activeBottomTab === tab.id
                        ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
                        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeBottomTab === 'results' && currentResult && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportAsCsv}
                    className="px-2 py-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>CSV</span>
                  </button>
                  <button
                    onClick={exportAsJson}
                    className="px-2 py-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>JSON</span>
                  </button>
                </div>
              )}
            </div>

            {/* TAB 1: RESULTS */}
            {activeBottomTab === 'results' && (
              <div>
                {!currentResult ? (
                  <div className="py-12 text-center text-xs text-[var(--text-muted)] space-y-2">
                    <Database className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
                    <p>Click &quot;Run&quot; or press Ctrl+Enter to execute the SQL query above.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-mono text-[11px]">
                      <span>Rows: {currentResult.totalRows}</span>
                      <span>Processed: {currentResult.bytesProcessed} bytes</span>
                      <span>Duration: {currentResult.executionTimeMs} ms</span>
                    </div>

                    <div className="border border-[var(--border-color)] rounded-xl overflow-x-auto max-h-72">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] sticky top-0">
                          <tr>
                            <th className="py-2 px-3 w-10 text-[var(--text-muted)]">#</th>
                            {currentResult.columns.map(col => (
                              <th key={col} className="py-2 px-3 font-semibold text-[var(--text-primary)]">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {currentResult.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-[var(--card-hover)]">
                              <td className="py-2 px-3 text-[var(--text-muted)]">{rIdx + 1}</td>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="py-2 px-3 text-[var(--text-secondary)]">
                                  {String(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: SCHEMA */}
            {activeBottomTab === 'schema' && (
              <div className="space-y-3">
                {selectedBqTable ? (
                  <div className="space-y-2">
                    <div className="text-xs text-[var(--text-secondary)] font-mono">
                      Table: <strong>{selectedBqTable.name}</strong> • Rows: {selectedBqTable.rowCount} • Size: {selectedBqTable.sizeBytes} bytes
                    </div>
                    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)]">
                          <tr>
                            <th className="py-2 px-3">Field name</th>
                            <th className="py-2 px-3">Type</th>
                            <th className="py-2 px-3">Mode</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {selectedBqTable.columns.map(c => (
                            <tr key={c.name} className="hover:bg-[var(--card-hover)]">
                              <td className="py-2 px-3 text-[var(--accent-blue)] font-bold">{c.name}</td>
                              <td className="py-2 px-3 text-[var(--text-secondary)]">{c.type}</td>
                              <td className="py-2 px-3 text-[var(--text-muted)]">{c.mode || 'NULLABLE'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center text-xs text-[var(--text-muted)]">
                    Select a table in the Explorer panel on the left to inspect its schema.
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: HISTORY */}
            {activeBottomTab === 'history' && (
              <div className="space-y-2">
                {bqQueryHistory.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[var(--text-muted)]">
                    No executed queries in this session.
                  </div>
                ) : (
                  <div className="space-y-2 font-mono text-xs">
                    {bqQueryHistory.map((q, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSqlQuery(q.query)}
                        className="p-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[var(--accent-blue)] cursor-pointer space-y-1"
                      >
                        <div className="flex justify-between text-[11px] text-[var(--text-muted)]">
                          <span>{new Date(q.executedAt).toLocaleTimeString()}</span>
                          <span>{q.totalRows} rows • {q.executionTimeMs}ms • {q.bytesProcessed} bytes</span>
                        </div>
                        <pre className="text-[var(--text-primary)] truncate">{q.query}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
