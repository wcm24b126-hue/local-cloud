import React, { useState } from 'react';
import {
  Plus,
  Search,
  Trash2,
  RefreshCw,
  Archive,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Shield,
  Layers,
  Globe,
  Lock,
} from 'lucide-react';
import { useLocalCloud } from '../../../context/LocalCloudContext';
import { Bucket } from '../../../types';

export const StorageBucketsList: React.FC = () => {
  const {
    buckets,
    currentProject,
    deleteBucket,
    setSelectedBucket,
    setCurrentFolderPrefix,
    setActiveView,
    showToast,
  } = useLocalCloud();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter buckets belonging to current project or emulator
  const filteredBuckets = buckets.filter(
    b =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.storageClass.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredBuckets.map(b => b.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (confirm(`Delete ${selectedIds.length} selected bucket(s)?`)) {
      selectedIds.forEach(id => deleteBucket(id));
      setSelectedIds([]);
    }
  };

  const handleCopyUri = (name: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`gs://${name}`);
    setCopiedId(id);
    showToast(`Copied gs://${name} to clipboard`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenBucket = (bucket: Bucket) => {
    setSelectedBucket(bucket);
    setCurrentFolderPrefix('');
    setActiveView('bucket-details', bucket.name, 'Cloud Storage');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border-color)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
            Cloud Storage Buckets
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Object storage for project{' '}
            <span className="font-mono text-[var(--text-primary)]">{currentProject.projectId}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1.5 rounded-lg bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20 font-semibold text-xs transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete ({selectedIds.length})</span>
            </button>
          )}

          <button
            onClick={() => setActiveView('bucket-create', 'Create a bucket', 'Cloud Storage')}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create bucket</span>
          </button>
        </div>
      </div>

      {/* Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Filter buckets by name, location, or class..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)]"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] font-mono">
          <span>{filteredBuckets.length} bucket(s)</span>
        </div>
      </div>

      {/* Buckets Table */}
      <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
        {filteredBuckets.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[var(--bg-canvas)] border border-[var(--border-color)] flex items-center justify-center mx-auto text-[var(--text-muted)]">
              <Archive className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                No storage buckets in this project
              </h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                Buckets are the basic containers that hold your data in Google Cloud Storage.
              </p>
            </div>
            <button
              onClick={() => setActiveView('bucket-create', 'Create a bucket', 'Cloud Storage')}
              className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create your first bucket</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium select-none">
                <tr>
                  <th className="py-3 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filteredBuckets.length && filteredBuckets.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--accent-blue)] focus:ring-0"
                    />
                  </th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Location type</th>
                  <th className="py-3 px-4">Default storage class</th>
                  <th className="py-3 px-4">Public access</th>
                  <th className="py-3 px-4">Access control</th>
                  <th className="py-3 px-4">Protection tools</th>
                  <th className="py-3 px-4 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredBuckets.map(b => {
                  const isChecked = selectedIds.includes(b.id);
                  return (
                    <tr
                      key={b.id}
                      onClick={() => handleOpenBucket(b)}
                      className={`cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-[var(--accent-blue-bg)]'
                          : 'hover:bg-[var(--card-hover)]'
                      }`}
                    >
                      <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(b.id)}
                          className="rounded border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--accent-blue)] focus:ring-0"
                        />
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Archive className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
                          <span className="font-semibold text-[var(--accent-blue)] hover:underline">
                            {b.name}
                          </span>
                          <button
                            onClick={e => handleCopyUri(b.name, b.id, e)}
                            className="p-1 hover:text-[var(--text-primary)] text-[var(--text-muted)] rounded transition-colors"
                            title="Copy gsutil URI"
                          >
                            {copiedId === b.id ? (
                              <Check className="w-3 h-3 text-[var(--success)]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                        {b.location}
                      </td>

                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {b.locationType}
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                          {b.storageClass}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {b.isPublic ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                            <Globe className="w-3.5 h-3.5" />
                            Public to internet
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                            <Lock className="w-3.5 h-3.5" />
                            Not public
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {b.accessControl === 'UNIFORM' ? 'Uniform' : 'Fine-grained'}
                      </td>

                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        <div className="flex items-center gap-1.5">
                          {b.versioning && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300">
                              Versioning
                            </span>
                          )}
                          {b.lifecycleRules.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300">
                              {b.lifecycleRules.length} Lifecycle rule(s)
                            </span>
                          )}
                          {!b.versioning && b.lifecycleRules.length === 0 && (
                            <span className="text-[var(--text-muted)]">None</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right text-[var(--text-muted)] font-mono text-[11px]">
                        {new Date(b.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
