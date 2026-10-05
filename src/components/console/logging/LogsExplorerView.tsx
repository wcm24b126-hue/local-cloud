import React, { useState } from 'react';
import {
  Terminal,
  Search,
  Filter,
  RotateCcw,
  Play,
  Pause,
  Download,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Shield,
  Activity,
  Server,
  CloudLightning,
  Archive,
  Radio,
  Layers,
  Key,
  ExternalLink,
} from 'lucide-react';
import { useLocalCloud } from '../../../context/LocalCloudContext';

export const LogsExplorerView: React.FC = () => {
  const { auditLogs, runLogs, currentProject, showToast } = useLocalCloud();

  const [resourceFilter, setResourceFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  // Combine audit logs and Cloud Run request logs into unified stream
  const unifiedLogs = [
    ...auditLogs.map(a => ({
      id: `audit-${a.id}`,
      timestamp: a.timestamp,
      severity: a.status === 'DENIED' || a.status === 'FAILED' ? ('ERROR' as const) : ('INFO' as const),
      service: a.service,
      resource: a.resourceName,
      principal: a.principal,
      message: `${a.method} on ${a.resourceName} (${a.status})${a.details ? ` - ${a.details}` : ''}`,
      payload: a,
      resourceType: a.service.includes('run')
        ? 'Cloud Run'
        : a.service.includes('compute')
        ? 'Compute Engine'
        : a.service.includes('storage')
        ? 'Cloud Storage'
        : a.service.includes('pubsub')
        ? 'Pub/Sub'
        : a.service.includes('iam')
        ? 'IAM & Admin'
        : 'Google Cloud Platform',
    })),
    ...runLogs.map(r => ({
      id: `run-${r.id}`,
      timestamp: r.timestamp,
      severity: r.severity,
      service: 'run.googleapis.com',
      resource: r.revisionName,
      principal: 'workload@system.gserviceaccount.com',
      message: r.textPayload,
      payload: r,
      resourceType: 'Cloud Run',
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredLogs = unifiedLogs.filter(l => {
    if (resourceFilter !== 'ALL' && l.resourceType !== resourceFilter) return false;
    if (severityFilter !== 'ALL' && l.severity !== severityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        l.message.toLowerCase().includes(q) ||
        l.service.toLowerCase().includes(q) ||
        l.resource.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedLogId(prev => (prev === id ? null : id));
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLogId(id);
    showToast('Copied JSON payload');
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              Logs Explorer
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">
              Cloud Logging & Observability
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Real-time unified log aggregation and query console for Compute, Storage, Run, Pub/Sub, and IAM audit trails.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsStreaming(prev => !prev);
              showToast(isStreaming ? 'Paused log stream' : 'Streaming live logs');
            }}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isStreaming
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {isStreaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{isStreaming ? 'Streaming...' : 'Stream logs'}</span>
          </button>

          <button
            onClick={() => showToast('Refreshed logs')}
            className="p-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-[var(--text-secondary)]"
            title="Refresh"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Query Bar */}
      <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-2">
          {/* Resource Filter */}
          <select
            value={resourceFilter}
            onChange={e => setResourceFilter(e.target.value)}
            className="w-full sm:w-44 px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none"
          >
            <option value="ALL">All resources</option>
            <option value="Cloud Run">Cloud Run</option>
            <option value="Compute Engine">Compute Engine</option>
            <option value="Cloud Storage">Cloud Storage</option>
            <option value="Pub/Sub">Pub/Sub</option>
            <option value="IAM & Admin">IAM & Admin</option>
          </select>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="w-full sm:w-36 px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none"
          >
            <option value="ALL">All severities</option>
            <option value="INFO">INFO & higher</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
          </select>

          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder='Search text or JSON fields, e.g. "order", "200", "insert"...'
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] font-mono"
            />
          </div>
        </div>

        {/* Timeline Histogram representation */}
        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)] font-mono text-[11px]">
          <span>Displaying {filteredLogs.length} matching log entries</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>INFO ({unifiedLogs.filter(l => l.severity === 'INFO').length})</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span>ERROR ({unifiedLogs.filter(l => l.severity === 'ERROR').length})</span>
            </span>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
        {filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-xs text-[var(--text-muted)] space-y-2">
            <Terminal className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
            <p>No log entries match your filter criteria.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)] font-mono text-xs select-text">
            {filteredLogs.map(log => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div key={log.id} className="hover:bg-[var(--card-hover)] transition-colors">
                  <div
                    onClick={() => toggleExpand(log.id)}
                    className="p-3 flex items-start gap-3 cursor-pointer"
                  >
                    <div className="pt-0.5 text-[var(--text-muted)] shrink-0">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </div>

                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        log.severity === 'ERROR'
                          ? 'bg-red-500/20 text-red-400'
                          : log.severity === 'WARNING'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {log.severity}
                    </span>

                    <span className="text-[var(--text-muted)] shrink-0 select-none">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>

                    <span className="px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[10px] text-[var(--accent-blue)] shrink-0 font-sans">
                      {log.resourceType}
                    </span>

                    <span className="text-[var(--text-primary)] font-mono truncate flex-1">
                      {log.message}
                    </span>
                  </div>

                  {/* Expanded JSON payload */}
                  {isExpanded && (
                    <div className="p-4 pt-1 pl-10 space-y-2 bg-black border-t border-neutral-900">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400 text-[11px] uppercase tracking-wider">
                          Structured JSON Payload
                        </span>
                        <button
                          onClick={() => handleCopy(JSON.stringify(log.payload, null, 2), log.id)}
                          className="text-xs text-[var(--accent-blue)] hover:underline flex items-center gap-1"
                        >
                          {copiedLogId === log.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>Copy JSON</span>
                        </button>
                      </div>

                      <pre className="p-3 rounded-lg bg-neutral-950 font-mono text-[11px] text-neutral-300 overflow-x-auto max-h-60 border border-neutral-800 leading-relaxed shadow-inner">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
