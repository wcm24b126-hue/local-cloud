import React, { useState } from 'react';
import {
  Cpu,
  Search,
  CheckCircle2,
  Power,
  PowerOff,
  ExternalLink,
  Shield,
  Layers,
  Database,
  Archive,
  Server,
  CloudLightning,
  AlertCircle,
  Activity,
} from 'lucide-react';
import { useLocalCloud } from '../../context/LocalCloudContext';

type ApiTab = 'enabled' | 'library';

export const ApisServicesView: React.FC<{ initialTab?: ApiTab }> = ({ initialTab = 'enabled' }) => {
  const {
    apiServices,
    toggleApi,
    currentProject,
    showToast,
  } = useLocalCloud();

  const [activeTab, setActiveTab] = useState<ApiTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', 'Compute', 'Storage', 'Databases', 'Analytics', 'Management'];

  const filteredApis = apiServices.filter(api => {
    const matchesSearch =
      api.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      api.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      api.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'All' || api.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const enabledApis = apiServices.filter(api => api.enabled);

  const getApiIcon = (category: string) => {
    switch (category) {
      case 'Compute':
        return Server;
      case 'Storage':
        return Archive;
      case 'Databases':
        return Database;
      case 'Analytics':
        return Activity;
      default:
        return Cpu;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border-color)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
            APIs &amp; Services
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Manage GCP API enablement, quotas, and service credentials for{' '}
            <span className="font-mono text-[var(--text-primary)]">{currentProject.projectId}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab(activeTab === 'library' ? 'enabled' : 'library')}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{activeTab === 'library' ? 'View Enabled APIs' : '+ Enable APIs and Services'}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border-color)] text-xs font-medium">
        <button
          onClick={() => setActiveTab('enabled')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'enabled'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Enabled APIs &amp; services ({enabledApis.length})
        </button>
        <button
          onClick={() => setActiveTab('library')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'library'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          API Library ({apiServices.length})
        </button>
      </div>

      {/* Tab 1: Enabled APIs Dashboard */}
      {activeTab === 'enabled' && (
        <div className="space-y-6">
          {/* Simulated API Traffic Metric Card */}
          <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-xs sm:text-sm text-[var(--text-primary)]">
                  Simulated API Traffic (Last 1 hour)
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Requests sent by client SDKs, Terraform, and the LocalCloud console.
                </p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                100% HEALTHY
              </span>
            </div>

            {/* Sparkline-style SVG metric chart */}
            <div className="h-20 w-full pt-2">
              <svg className="w-full h-full" viewBox="0 0 500 60" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="apiGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#8ab4f8" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#8ab4f8" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,45 Q50,40 100,25 T200,35 T300,15 T400,28 T500,10 L500,60 L0,60 Z"
                  fill="url(#apiGrad)"
                />
                <path
                  d="M0,45 Q50,40 100,25 T200,35 T300,15 T400,28 T500,10"
                  fill="none"
                  stroke="#8ab4f8"
                  strokeWidth="2"
                />
              </svg>
            </div>
          </div>

          {/* Enabled APIs Table */}
          <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden">
            <div className="p-3 bg-[var(--bg-canvas)] border-b border-[var(--border-color)] flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text-primary)]">Enabled APIs for this project</span>
              <span>{enabledApis.length} active</span>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-medium">
                <tr>
                  <th className="py-2.5 px-4">API Name</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Pricing Note</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {enabledApis.map(api => {
                  const Icon = getApiIcon(api.category);
                  return (
                    <tr key={api.id} className="hover:bg-[var(--card-hover)] transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
                          <div>
                            <span className="font-semibold text-[var(--text-primary)]">{api.title}</span>
                            <span className="text-[11px] font-mono text-[var(--text-muted)] block">
                              {api.name}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">{api.category}</td>
                      <td className="py-3 px-4 text-[var(--text-muted)] text-[11px]">{api.pricingNote}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => toggleApi(api.id, false)}
                          className="px-2.5 py-1 rounded text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10 font-medium transition-colors"
                        >
                          Disable API
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: API Library */}
      {activeTab === 'library' && (
        <div className="space-y-4">
          {/* Search & Category Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search API library (e.g. 'Compute', 'Storage', 'SQL')..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>

            {/* Category Segmented Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] border border-[var(--accent-blue-border)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--card-hover)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredApis.map(api => {
              const Icon = getApiIcon(api.category);
              return (
                <div
                  key={api.id}
                  className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--accent-blue-border)] transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="p-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                        <Icon className="w-4 h-4 text-[var(--accent-blue)]" />
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          api.enabled
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {api.enabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-semibold text-xs sm:text-sm text-[var(--text-primary)]">
                        {api.title}
                      </h4>
                      <code className="text-[10px] text-[var(--text-muted)] block mt-0.5 truncate">
                        {api.id}
                      </code>
                    </div>

                    <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                      {api.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
                    <span className="text-[10px] text-[var(--text-muted)]">{api.pricingNote}</span>
                    {api.enabled ? (
                      <button
                        onClick={() => toggleApi(api.id, false)}
                        className="px-2.5 py-1 rounded text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10 font-medium transition-colors"
                      >
                        Disable
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleApi(api.id, true)}
                        className="px-3 py-1 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors"
                      >
                        Enable API
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
