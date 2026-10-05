import React, { useState } from 'react';
import {
  CloudLightning,
  Plus,
  Trash2,
  ExternalLink,
  Play,
  RotateCcw,
  Activity,
  Terminal,
  FileCode,
  Layers,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  Sparkles,
  Search,
  Globe,
  Server,
  ArrowRight,
  ArrowLeft,
  X,
  Code2,
  Cpu,
  HardDrive,
  Send,
} from 'lucide-react';
import { useLocalCloud } from '../../../context/LocalCloudContext';
import { CloudRunService, CloudRunRevision } from '../../../types';

export const CloudRunView: React.FC = () => {
  const {
    runServices,
    runLogs,
    selectedRunService,
    setSelectedRunService,
    deployRunService,
    deleteRunService,
    invokeRunService,
    currentProject,
    showToast,
  } = useLocalCloud();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'invoke' | 'revisions' | 'logs' | 'source'>('invoke');

  // Deploy Modal
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [region, setRegion] = useState('us-central1');
  const [sourceType, setSourceType] = useState<'NODE' | 'PYTHON' | 'IMAGE'>('NODE');
  const [containerImage, setContainerImage] = useState('gcr.io/google-samples/hello-app:1.0');
  const [cpu, setCpu] = useState('1');
  const [memory, setMemory] = useState('512Mi');
  const [minInstances, setMinInstances] = useState(0);
  const [maxInstances, setMaxInstances] = useState(10);
  const [allowUnauthenticated, setAllowUnauthenticated] = useState(true);

  // Template source code
  const nodeTemplate = `// LocalCloud Express Microservice (Node.js 22)
import express from 'express';
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Hello from Cloud Run on LocalCloud!',
    timestamp: new Date().toISOString()
  });
});

app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

app.post('/echo', (req, res) => {
  res.json({
    received: req.body,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
});

export default app;`;

  const pythonTemplate = `# LocalCloud Flask Microservice (Python 3.11)
from flask import Flask, jsonify, request
from datetime import datetime

app = Flask(__name__)

@app.route('/', methods=['GET'])
def hello():
    return jsonify({
        'status': 'healthy',
        'message': 'Hello from Cloud Run Python Flask!',
        'timestamp': datetime.utcnow().isoformat()
    })

@app.route('/healthz', methods=['GET'])
def health():
    return 'OK', 200

@app.route('/echo', methods=['POST'])
def echo():
    return jsonify({
        'received': request.get_json(silent=True),
        'timestamp': datetime.utcnow().isoformat()
    })
`;

  const [inlineCode, setInlineCode] = useState(nodeTemplate);

  // Invocations & Reverse Proxy Testing
  const [invokeMethod, setInvokeMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [invokePath, setInvokePath] = useState('/');
  const [invokeHeaders, setInvokeHeaders] = useState('{\n  "accept": "application/json"\n}');
  const [invokeBody, setInvokeBody] = useState('{\n  "sample": "data from tester"\n}');
  const [invokeResponse, setInvokeResponse] = useState<any>(null);
  const [invokeStatus, setInvokeStatus] = useState<number | null>(null);
  const [invokeLatency, setInvokeLatency] = useState<number | null>(null);
  const [isInvoking, setIsInvoking] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Find freshest selected service
  const currentService = runServices.find(s => s.id === selectedRunService?.id) || selectedRunService;

  const filteredServices = runServices.filter(
    s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeploy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim()) return;

    const newService = deployRunService({
      name: serviceName.trim().toLowerCase(),
      region,
      allowUnauthenticated,
      initialRevision: {
        sourceType,
        image: sourceType === 'IMAGE' ? containerImage : `${serviceName}:latest`,
        sourceCode: sourceType !== 'IMAGE' ? inlineCode : undefined,
        cpu,
        memory,
        minInstances,
        maxInstances,
      },
    });

    setIsDeployModalOpen(false);
    setSelectedRunService(newService);
    setServiceName('');
    showToast(`Service "${newService.name}" deployed successfully`);
  };

  const handleTestInvoke = async () => {
    if (!currentService) return;
    setIsInvoking(true);
    setInvokeResponse(null);

    let parsedHeaders = {};
    try {
      parsedHeaders = JSON.parse(invokeHeaders);
    } catch {
      // Ignore
    }

    try {
      // First attempt real HTTP request against the local reverse proxy path
      const proxyUrl = `/api/run/${currentService.name}${invokePath.startsWith('/') ? invokePath : '/' + invokePath}`;
      const start = Date.now();
      const res = await fetch(proxyUrl, {
        method: invokeMethod,
        headers: {
          'Content-Type': 'application/json',
          ...parsedHeaders,
        },
        body: invokeMethod !== 'GET' ? invokeBody : undefined,
      });

      const latency = Date.now() - start;
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await res.json() : await res.text();

      setInvokeStatus(res.status);
      setInvokeLatency(latency);
      setInvokeResponse(data);

      // Also trigger invokeRunService to keep internal state/logs updated
      invokeRunService(
        currentService.id,
        invokePath,
        invokeMethod,
        parsedHeaders,
        invokeMethod !== 'GET' ? invokeBody : undefined
      ).catch(() => {});
    } catch {
      // Fallback to internal engine simulation if direct network fetch is blocked
      const result = await invokeRunService(
        currentService.id,
        invokePath,
        invokeMethod,
        parsedHeaders,
        invokeMethod !== 'GET' ? invokeBody : undefined
      );

      setInvokeStatus(result.status);
      setInvokeLatency(result.latencyMs);
      setInvokeResponse(result.data);
    } finally {
      setIsInvoking(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              Cloud Run
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">
              Serverless Containers
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Deploy scalable containerized applications directly on Google infrastructure with automatic scale-to-zero.
          </p>
        </div>

        <button
          onClick={() => {
            setServiceName('');
            setInlineCode(nodeTemplate);
            setIsDeployModalOpen(true);
          }}
          className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Deploy service</span>
        </button>
      </div>

      {currentService ? (
        /* SERVICE DETAILS VIEW */
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Top Info Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
            <div className="space-y-1.5">
              <button
                onClick={() => setSelectedRunService(null)}
                className="text-xs text-[var(--accent-blue)] hover:underline flex items-center gap-1 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All Cloud Run services</span>
              </button>

              <div className="flex items-center gap-3">
                <CloudLightning className="w-6 h-6 text-[var(--accent-blue)] shrink-0" />
                <h2 className="text-xl font-bold text-[var(--text-primary)]">
                  {currentService.name}
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Ready
                </span>
              </div>

              {/* URL with Copy & External Link */}
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-[var(--text-secondary)]">Cloud URL:</span>
                <span className="text-[var(--accent-blue)] truncate max-w-md">{currentService.url}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(currentService.url);
                    setCopiedUrl(true);
                    showToast('Copied URL to clipboard');
                    setTimeout(() => setCopiedUrl(false), 2000);
                  }}
                  className="p-1 hover:text-[var(--text-primary)] text-[var(--text-muted)]"
                  title="Copy URL"
                >
                  {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>

              {/* Local Reverse Proxy Path */}
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-[var(--text-secondary)]">Local reverse proxy:</span>
                <a
                  href={`/api/run/${currentService.name}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline truncate max-w-md flex items-center gap-1"
                >
                  <span>/api/run/{currentService.name}/</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
                <button
                  onClick={() => {
                    const curlCmd = `curl -i "${window.location.origin}/api/run/${currentService.name}/"`;
                    navigator.clipboard.writeText(curlCmd);
                    showToast('Copied curl command');
                  }}
                  className="px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  title="Copy curl command"
                >
                  Copy cURL
                </button>
              </div>

              <div className="text-xs text-[var(--text-secondary)] flex items-center gap-4 pt-0.5">
                <span>Region: <strong className="text-[var(--text-primary)]">{currentService.region}</strong></span>
                <span>•</span>
                <span>Active Instances: <strong className={currentService.activeInstances > 0 ? 'text-emerald-400' : 'text-[var(--text-muted)]'}>{currentService.activeInstances} (Scale-to-zero)</strong></span>
                <span>•</span>
                <span>Latest Revision: <strong className="text-[var(--text-primary)] font-mono">{currentService.latestRevisionName}</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (confirm(`Delete Cloud Run service ${currentService.name}?`)) {
                    deleteRunService(currentService.id);
                  }
                }}
                className="px-3 py-1.5 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/10 text-xs font-semibold flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-6 border-b border-[var(--border-color)] text-xs font-medium">
            {[
              { id: 'invoke', label: 'Test & Invoke (Reverse Proxy)', icon: Globe },
              { id: 'revisions', label: 'Revisions', icon: Layers },
              { id: 'logs', label: 'Logs', icon: Terminal },
              { id: 'source', label: 'Source Code / Image', icon: FileCode },
            ].map(t => {
              const isActive = activeTab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
                    isActive
                      ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: TEST & INVOKE */}
          {activeTab === 'invoke' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[var(--accent-blue)]" />
                      <span>Local Reverse Proxy Request Tester</span>
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Sends real HTTP requests through the LocalCloud reverse proxy layer to your service instances.
                    </p>
                  </div>

                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                    Instances: {currentService.activeInstances}
                  </span>
                </div>

                {/* URL Bar */}
                <div className="flex items-center gap-2">
                  <select
                    value={invokeMethod}
                    onChange={e => setInvokeMethod(e.target.value as any)}
                    className="px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs font-bold text-[var(--accent-blue)] focus:outline-none"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>

                  <div className="flex-1 flex items-center rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] px-3 py-2 text-xs font-mono">
                    <span className="text-[var(--text-muted)] select-none truncate max-w-[200px] sm:max-w-none">
                      {currentService.url}
                    </span>
                    <input
                      type="text"
                      value={invokePath}
                      onChange={e => setInvokePath(e.target.value)}
                      placeholder="/ (e.g. /healthz or /echo)"
                      className="flex-1 bg-transparent text-[var(--text-primary)] focus:outline-none pl-1"
                    />
                  </div>

                  <button
                    onClick={handleTestInvoke}
                    disabled={isInvoking}
                    className="px-5 py-2 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <Send className={`w-3.5 h-3.5 ${isInvoking ? 'animate-spin' : ''}`} />
                    <span>{isInvoking ? 'Sending...' : 'Send'}</span>
                  </button>
                </div>

                {/* Quick Paths */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[var(--text-muted)]">Presets:</span>
                  {['/', '/healthz', '/echo'].map(p => (
                    <button
                      key={p}
                      onClick={() => setInvokePath(p)}
                      className="px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-blue)] font-mono text-[11px]"
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {/* Request Body (if POST/PUT) */}
                {invokeMethod !== 'GET' && (
                  <div className="space-y-1 pt-2">
                    <label className="block text-xs font-medium text-[var(--text-secondary)]">
                      Request Body (JSON)
                    </label>
                    <textarea
                      rows={3}
                      value={invokeBody}
                      onChange={e => setInvokeBody(e.target.value)}
                      className="w-full p-3 rounded-lg bg-black text-neutral-200 font-mono text-xs border border-neutral-800"
                    />
                  </div>
                )}

                {/* Response Viewer */}
                {invokeResponse !== null && (
                  <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)] animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-[var(--text-primary)]">Response:</span>
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded ${
                            invokeStatus && invokeStatus < 400
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}
                        >
                          {invokeStatus} OK
                        </span>
                        <span className="text-[var(--text-muted)] font-mono">{invokeLatency} ms</span>
                      </div>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(invokeResponse, null, 2));
                          showToast('Copied response JSON');
                        }}
                        className="text-xs text-[var(--accent-blue)] hover:underline flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy JSON</span>
                      </button>
                    </div>

                    <pre className="p-4 rounded-xl bg-black font-mono text-xs text-neutral-200 overflow-x-auto max-h-80 border border-neutral-800 leading-relaxed shadow-inner">
                      {JSON.stringify(invokeResponse, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: REVISIONS */}
          {activeTab === 'revisions' && (
            <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-3 px-4">Revision</th>
                    <th className="py-3 px-4">Traffic</th>
                    <th className="py-3 px-4">Source / Image</th>
                    <th className="py-3 px-4">CPU & Memory</th>
                    <th className="py-3 px-4">Autoscaling</th>
                    <th className="py-3 px-4">Deployed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                  {currentService.revisions.map(rev => (
                    <tr key={rev.id} className="hover:bg-[var(--card-hover)]">
                      <td className="py-3.5 px-4 font-semibold text-[var(--accent-blue)]">
                        {rev.name}
                      </td>
                      <td className="py-3.5 px-4 text-emerald-400 font-bold">
                        {rev.trafficPercent}%
                      </td>
                      <td className="py-3.5 px-4 font-sans text-[var(--text-secondary)]">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 border border-neutral-700 font-mono mr-2">
                          {rev.sourceType}
                        </span>
                        <span className="truncate max-w-xs">{rev.image}</span>
                      </td>
                      <td className="py-3.5 px-4 text-[var(--text-secondary)]">
                        {rev.cpu} vCPU, {rev.memory}
                      </td>
                      <td className="py-3.5 px-4 text-[var(--text-secondary)] font-sans">
                        Min: {rev.minInstances}, Max: {rev.maxInstances}
                      </td>
                      <td className="py-3.5 px-4 text-[var(--text-muted)]">
                        {new Date(rev.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <span>Structured log stream for {currentService.name} (stdout/stderr & request logs)</span>
                <button
                  onClick={() => showToast('Logs refreshed')}
                  className="px-2.5 py-1 rounded-md border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-primary)] flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="rounded-2xl bg-black border border-neutral-800 p-4 font-mono text-xs overflow-x-auto max-h-[500px] overflow-y-auto space-y-2 select-text shadow-inner">
                {runLogs
                  .filter(l => l.serviceId === currentService.id)
                  .map(log => (
                    <div key={log.id} className="flex items-start gap-3 leading-relaxed">
                      <span className="text-neutral-500 shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                          log.severity === 'ERROR'
                            ? 'bg-red-500/20 text-red-400'
                            : log.severity === 'WARNING'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {log.severity}
                      </span>
                      <span className="text-neutral-300 break-all">{log.textPayload}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB 4: SOURCE CODE */}
          {activeTab === 'source' && (
            <div className="space-y-3">
              <div className="text-xs text-[var(--text-secondary)]">
                Active source code deployed in revision <span className="font-mono text-[var(--text-primary)]">{currentService.latestRevisionName}</span>
              </div>
              <pre className="p-4 rounded-2xl bg-black border border-neutral-800 font-mono text-xs text-neutral-300 overflow-x-auto max-h-[500px] leading-relaxed shadow-inner">
                {currentService.revisions[0]?.sourceCode || `// Container Image: ${currentService.revisions[0]?.image}\n// Docker container image deployed without inline source editor.`}
              </pre>
            </div>
          )}
        </div>
      ) : (
        /* SERVICES LIST TABLE */
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative max-w-sm flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter services by name or region..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {filteredServices.length} service(s)
            </span>
          </div>

          <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            {filteredServices.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <CloudLightning className="w-10 h-10 text-[var(--text-muted)] mx-auto" />
                <h4 className="font-semibold text-sm text-[var(--text-primary)]">
                  No Cloud Run services found
                </h4>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                  Deploy containerized web services, APIs, and microservices in seconds.
                </p>
                <button
                  onClick={() => setIsDeployModalOpen(true)}
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Deploy your first service
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Region</th>
                    <th className="py-3 px-4">URL</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Active instances</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                  {filteredServices.map(service => (
                    <tr
                      key={service.id}
                      onClick={() => setSelectedRunService(service)}
                      className="cursor-pointer hover:bg-[var(--card-hover)] transition-colors"
                    >
                      <td className="py-3.5 px-4 font-sans">
                        <div className="flex items-center gap-2">
                          <CloudLightning className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
                          <span className="font-semibold text-[var(--accent-blue)] hover:underline">
                            {service.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[var(--text-secondary)]">{service.region}</td>
                      <td className="py-3.5 px-4 text-[var(--accent-blue)] truncate max-w-xs" onClick={e => e.stopPropagation()}>
                        <a
                          href={service.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline flex items-center gap-1"
                        >
                          <span className="truncate">{service.url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Ready
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-sans">
                        <span className={service.activeInstances > 0 ? 'text-emerald-400 font-semibold' : 'text-[var(--text-muted)]'}>
                          {service.activeInstances} instance(s)
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setSelectedRunService(service);
                            setActiveTab('invoke');
                          }}
                          className="px-2.5 py-1 rounded-md bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] hover:border-[var(--accent-blue)] font-sans mr-2"
                        >
                          Test Invoke
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete service ${service.name}?`)) {
                              deleteRunService(service.id);
                            }
                          }}
                          className="p-1 hover:text-[var(--danger)] text-[var(--text-muted)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* DEPLOY SERVICE MODAL */}
      {isDeployModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                <CloudLightning className="w-4 h-4 text-[var(--accent-blue)]" />
                <span>Deploy a Cloud Run service</span>
              </h3>
              <button onClick={() => setIsDeployModalOpen(false)} className="text-[var(--text-muted)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDeploy} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Service name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. hello-microservice"
                  value={serviceName}
                  onChange={e => setServiceName(e.target.value.toLowerCase())}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Region <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={region}
                    onChange={e => setRegion(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  >
                    <option value="us-central1">us-central1 (Iowa)</option>
                    <option value="us-east1">us-east1 (South Carolina)</option>
                    <option value="europe-west1">europe-west1 (Belgium)</option>
                    <option value="asia-east1">asia-east1 (Taiwan)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Deployment Source
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'NODE', label: 'Node.js' },
                      { id: 'PYTHON', label: 'Python' },
                      { id: 'IMAGE', label: 'Docker' },
                    ].map(st => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setSourceType(st.id as any);
                          if (st.id === 'NODE') setInlineCode(nodeTemplate);
                          if (st.id === 'PYTHON') setInlineCode(pythonTemplate);
                        }}
                        className={`py-1.5 rounded-lg border text-center text-[11px] font-semibold transition-colors ${
                          sourceType === st.id
                            ? 'bg-[var(--accent-blue)] text-black border-[var(--accent-blue)]'
                            : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-color)]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {sourceType === 'IMAGE' ? (
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Container image URL <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="gcr.io/google-samples/hello-app:1.0"
                    value={containerImage}
                    onChange={e => setContainerImage(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono"
                  />
                </div>
              ) : (
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Inline Source Code ({sourceType === 'NODE' ? 'Express / Node.js' : 'Flask / Python'})
                  </label>
                  <textarea
                    rows={8}
                    value={inlineCode}
                    onChange={e => setInlineCode(e.target.value)}
                    className="w-full p-3 rounded-lg bg-black text-neutral-200 font-mono text-xs border border-neutral-800 leading-relaxed focus:outline-none focus:border-[var(--accent-blue)]"
                  />
                </div>
              )}

              {/* Hardware & Autoscaling */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Hardware (CPU & Memory)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={cpu}
                      onChange={e => setCpu(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)]"
                    >
                      <option value="1">1 vCPU</option>
                      <option value="2">2 vCPU</option>
                    </select>

                    <select
                      value={memory}
                      onChange={e => setMemory(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)]"
                    >
                      <option value="512Mi">512 MiB</option>
                      <option value="1Gi">1 GiB</option>
                      <option value="2Gi">2 GiB</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Autoscaling (Min / Max instances)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={minInstances}
                      onChange={e => setMinInstances(parseInt(e.target.value) || 0)}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)]"
                      title="Min instances (0 for scale-to-zero)"
                    />
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={maxInstances}
                      onChange={e => setMaxInstances(parseInt(e.target.value) || 10)}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)]"
                      title="Max instances"
                    />
                  </div>
                </div>
              </div>

              {/* Ingress */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={allowUnauthenticated}
                    onChange={e => setAllowUnauthenticated(e.target.checked)}
                    className="rounded border-[var(--border-color)] bg-[var(--bg-canvas)] text-[var(--accent-blue)]"
                  />
                  <span>Allow unauthenticated invocations (Public HTTP service)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsDeployModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[var(--accent-blue)] text-black font-semibold"
                >
                  Deploy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
