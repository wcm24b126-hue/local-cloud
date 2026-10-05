import React, { useState } from 'react';
import {
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Search,
  ExternalLink,
  Shield,
  Layers,
  ArrowLeft,
  X,
  Lock,
  Tag,
  AlertTriangle,
} from 'lucide-react';
import { useLocalCloud } from '../../../context/LocalCloudContext';
import { Secret, SecretVersion } from '../../../types';

export const SecretManagerView: React.FC = () => {
  const {
    secrets,
    selectedSecret,
    setSelectedSecret,
    createSecret,
    deleteSecret,
    addSecretVersion,
    destroySecretVersion,
    currentProject,
    showToast,
  } = useLocalCloud();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddVersionModalOpen, setIsAddVersionModalOpen] = useState(false);

  // Create Secret Form
  const [newSecretName, setNewSecretName] = useState('');
  const [newSecretPayload, setNewSecretPayload] = useState('');
  const [newLabelKey, setNewLabelKey] = useState('');
  const [newLabelVal, setNewLabelVal] = useState('');
  const [labels, setLabels] = useState<Record<string, string>>({ env: 'production' });

  // Add Version Form
  const [versionPayload, setVersionPayload] = useState('');

  // Revealed values map: versionId -> boolean
  const [revealedVersions, setRevealedVersions] = useState<Record<string, boolean>>({});
  const [copiedVer, setCopiedVer] = useState<string | null>(null);

  const activeSecret = secrets.find(s => s.id === selectedSecret?.id) || selectedSecret;

  const filteredSecrets = secrets.filter(
    s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      Object.keys(s.labels).some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleCreateSecret = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSecretName.trim() || !newSecretPayload.trim()) return;

    const sec = createSecret(newSecretName, newSecretPayload, labels);
    setNewSecretName('');
    setNewSecretPayload('');
    setIsCreateModalOpen(false);
    setSelectedSecret(sec);
  };

  const handleAddVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSecret || !versionPayload.trim()) return;

    addSecretVersion(activeSecret.id, versionPayload);
    setVersionPayload('');
    setIsAddVersionModalOpen(false);
  };

  const toggleReveal = (verNum: string) => {
    setRevealedVersions(prev => ({ ...prev, [verNum]: !prev[verNum] }));
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedVer(id);
    showToast('Copied secret value to clipboard');
    setTimeout(() => setCopiedVer(null), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              Secret Manager
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">
              Secure Key Management
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Store, manage, and rotate API keys, database credentials, certificates, and sensitive configuration data.
          </p>
        </div>

        <button
          onClick={() => {
            setNewSecretName('');
            setNewSecretPayload('');
            setIsCreateModalOpen(true);
          }}
          className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Create secret</span>
        </button>
      </div>

      {activeSecret ? (
        /* SECRET DETAILS VIEW */
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
            <div className="space-y-1.5">
              <button
                onClick={() => setSelectedSecret(null)}
                className="text-xs text-[var(--accent-blue)] hover:underline flex items-center gap-1 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All secrets</span>
              </button>

              <div className="flex items-center gap-3">
                <Key className="w-6 h-6 text-[var(--accent-blue)] shrink-0" />
                <h2 className="text-xl font-bold text-[var(--text-primary)]">
                  {activeSecret.name}
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Lock className="w-3 h-3" />
                  Automatic Replication
                </span>
              </div>

              <div className="text-xs text-[var(--text-secondary)] flex items-center gap-4 pt-0.5 font-mono">
                <span>Resource: <strong>projects/{currentProject.projectId}/secrets/{activeSecret.name}</strong></span>
                <span>•</span>
                <span>Created: {new Date(activeSecret.createdAt).toLocaleDateString()}</span>
              </div>

              {/* Labels */}
              {activeSecret.labels && Object.keys(activeSecret.labels).length > 0 && (
                <div className="flex items-center gap-1.5 pt-1 text-xs">
                  <Tag className="w-3 h-3 text-[var(--text-muted)]" />
                  {Object.entries(activeSecret.labels).map(([k, v]) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)]"
                    >
                      {k}: {v}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setVersionPayload('');
                  setIsAddVersionModalOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add new version</span>
              </button>

              <button
                onClick={() => {
                  if (confirm(`Delete secret ${activeSecret.name} and all its versions?`)) {
                    deleteSecret(activeSecret.id);
                  }
                }}
                className="px-3 py-1.5 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/10 text-xs font-semibold flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {/* Versions Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
              Secret Versions ({activeSecret.versions.length})
            </h3>

            <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-3 px-4">Version</th>
                    <th className="py-3 px-4">State</th>
                    <th className="py-3 px-4">Secret Value (Payload)</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                  {activeSecret.versions.map(ver => {
                    const isRevealed = revealedVersions[ver.version];
                    const isDestroyed = ver.state === 'DESTROYED';
                    return (
                      <tr key={ver.version} className="hover:bg-[var(--card-hover)]">
                        <td className="py-3.5 px-4 font-bold text-[var(--accent-blue)]">
                          version {ver.version} {ver.version === String(activeSecret.versions.length) && <span className="text-[10px] text-[var(--text-muted)] font-normal">(latest)</span>}
                        </td>
                        <td className="py-3.5 px-4">
                          {isDestroyed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/20">
                              Destroyed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Enabled
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono max-w-md">
                          {isDestroyed ? (
                            <span className="text-[var(--text-muted)] italic">Payload destroyed</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-[var(--text-primary)] truncate max-w-xs select-all">
                                {isRevealed ? ver.payload : '••••••••••••••••••••••••••••••••'}
                              </span>
                              <button
                                onClick={() => toggleReveal(ver.version)}
                                className="p-1 hover:text-[var(--accent-blue)] text-[var(--text-muted)]"
                                title={isRevealed ? 'Hide secret' : 'Reveal secret'}
                              >
                                {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleCopy(ver.payload, ver.version)}
                                className="p-1 hover:text-[var(--accent-blue)] text-[var(--text-muted)]"
                                title="Copy secret value"
                              >
                                {copiedVer === ver.version ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-[var(--text-muted)]">
                          {new Date(ver.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-sans">
                          {!isDestroyed && (
                            <button
                              onClick={() => {
                                if (confirm(`Destroy version ${ver.version}? This cannot be undone.`)) {
                                  destroySecretVersion(activeSecret.id, ver.version);
                                }
                              }}
                              className="px-2 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[11px]"
                            >
                              Destroy
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* SECRETS LIST TABLE */
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative max-w-sm flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter secrets by name..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {filteredSecrets.length} secret(s)
            </span>
          </div>

          <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            {filteredSecrets.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <Key className="w-10 h-10 text-[var(--text-muted)] mx-auto" />
                <h4 className="font-semibold text-sm text-[var(--text-primary)]">
                  No secrets found
                </h4>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                  Secret Manager securely stores API keys, database passwords, and credentials with fine-grained IAM controls.
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Create secret
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Replication</th>
                    <th className="py-3 px-4">Latest version</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                  {filteredSecrets.map(sec => (
                    <tr
                      key={sec.id}
                      onClick={() => setSelectedSecret(sec)}
                      className="cursor-pointer hover:bg-[var(--card-hover)] transition-colors"
                    >
                      <td className="py-3.5 px-4 font-sans">
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
                          <span className="font-semibold text-[var(--accent-blue)] hover:underline">
                            {sec.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[var(--text-secondary)]">{sec.replication}</td>
                      <td className="py-3.5 px-4 text-emerald-400">version {sec.versions.length}</td>
                      <td className="py-3.5 px-4 text-[var(--text-muted)]">
                        {new Date(sec.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            if (confirm(`Delete secret ${sec.name}?`)) {
                              deleteSecret(sec.id);
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

      {/* CREATE SECRET MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                <Key className="w-4 h-4 text-[var(--accent-blue)]" />
                <span>Create secret</span>
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-[var(--text-muted)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSecret} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. database-password"
                  value={newSecretName}
                  onChange={e => setNewSecretName(e.target.value.toLowerCase())}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Secret value <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Enter secret text payload, token, private key, or password"
                  value={newSecretPayload}
                  onChange={e => setNewSecretPayload(e.target.value)}
                  className="w-full p-3 rounded-lg bg-black text-neutral-200 font-mono text-xs border border-neutral-800 focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[var(--accent-blue)] text-black font-semibold"
                >
                  Create secret
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD VERSION MODAL */}
      {isAddVersionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[var(--accent-blue)]" />
                <span>Add new version to {activeSecret?.name}</span>
              </h3>
              <button onClick={() => setIsAddVersionModalOpen(false)} className="text-[var(--text-muted)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddVersion} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  New secret payload <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Enter the rotated secret payload..."
                  value={versionPayload}
                  onChange={e => setVersionPayload(e.target.value)}
                  className="w-full p-3 rounded-lg bg-black text-neutral-200 font-mono text-xs border border-neutral-800 focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsAddVersionModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[var(--accent-blue)] text-black font-semibold"
                >
                  Add version
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
