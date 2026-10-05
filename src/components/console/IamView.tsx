import React, { useState } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Trash2,
  Key,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  Plus,
  X,
  Shield,
  FileJson,
} from 'lucide-react';
import { useLocalCloud } from '../../context/LocalCloudContext';
import { CloudRole } from '../../types';

export const IamView: React.FC = () => {
  const {
    currentProject,
    members,
    addMember,
    removeMember,
    serviceAccounts,
    createServiceAccount,
    deleteServiceAccount,
    auditLogs,
    showToast,
  } = useLocalCloud();

  const [activeTab, setActiveTab] = useState<'members' | 'roles' | 'service-accounts' | 'audit'>('members');
  const [searchFilter, setSearchFilter] = useState('');

  // Modals
  const [isGrantAccessOpen, setIsGrantAccessOpen] = useState(false);
  const [isCreateSaOpen, setIsCreateSaOpen] = useState(false);
  const [keyModalSa, setKeyModalSa] = useState<string | null>(null);

  // Grant Access Form
  const [newPrincipal, setNewPrincipal] = useState('');
  const [selectedRole, setSelectedRole] = useState<CloudRole>('roles/viewer');
  const [principalType, setPrincipalType] = useState<'user' | 'serviceAccount' | 'group'>('user');

  // Create SA Form
  const [saName, setSaName] = useState('');
  const [saDisplayName, setSaDisplayName] = useState('');
  const [saDescription, setSaDescription] = useState('');

  const PREDEFINED_ROLES: { id: CloudRole; title: string; category: string; description: string }[] = [
    {
      id: 'roles/owner',
      title: 'Owner',
      category: 'Basic',
      description: 'Full access to all resources. Can manage billing and grant permissions to other users.',
    },
    {
      id: 'roles/editor',
      title: 'Editor',
      category: 'Basic',
      description: 'Can deploy and edit all resources, but cannot modify permissions or delete projects.',
    },
    {
      id: 'roles/viewer',
      title: 'Viewer',
      category: 'Basic',
      description: 'Read-only access to existing resources and configurations across the project.',
    },
    {
      id: 'roles/compute.admin',
      title: 'Compute Admin',
      category: 'Compute Engine',
      description: 'Full control of all Compute Engine resources (VMs, disks, firewalls, images).',
    },
    {
      id: 'roles/storage.admin',
      title: 'Storage Admin',
      category: 'Cloud Storage',
      description: 'Full control of Cloud Storage buckets and objects.',
    },
    {
      id: 'roles/bigquery.admin',
      title: 'BigQuery Admin',
      category: 'BigQuery',
      description: 'Full control of datasets, tables, queries, and BigQuery permissions.',
    },
    {
      id: 'roles/iam.serviceAccountUser',
      title: 'Service Account User',
      category: 'Identity',
      description: 'Run operations as a service account, needed for attaching service accounts to VMs.',
    },
    {
      id: 'roles/billing.admin',
      title: 'Billing Account Administrator',
      category: 'Billing',
      description: 'Manage billing account associations, payment instruments, and budgets.',
    },
  ];

  const handleGrantAccessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrincipal.trim()) return;
    addMember(newPrincipal.trim(), [selectedRole], principalType);
    setNewPrincipal('');
    setIsGrantAccessOpen(false);
  };

  const handleCreateSaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saName.trim()) return;
    createServiceAccount(
      saName.toLowerCase().replace(/[^a-z0-9-]/g, ''),
      saDisplayName || saName,
      saDescription
    );
    setSaName('');
    setSaDisplayName('');
    setSaDescription('');
    setIsCreateSaOpen(false);
  };

  const handleDownloadKeyJson = (email: string) => {
    const keyData = {
      type: 'service_account',
      project_id: currentProject.projectId,
      private_key_id: Math.random().toString(36).substring(2, 14),
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7...EMULATED\n-----END PRIVATE KEY-----\n',
      client_email: email,
      client_id: Math.floor(100000000000 + Math.random() * 900000000000).toString(),
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(email)}`,
    };

    const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${email.split('@')[0]}-key.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded service account JSON key');
    setKeyModalSa(null);
  };

  const filteredMembers = members.filter(
    m =>
      m.principal.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.roles.some(r => r.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border-color)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
            IAM &amp; Admin
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Manage permissions, roles, and service identities for project{' '}
            <span className="font-mono text-[var(--text-primary)]">{currentProject.projectId}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'members' && (
            <button
              onClick={() => setIsGrantAccessOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Grant access</span>
            </button>
          )}

          {activeTab === 'service-accounts' && (
            <button
              onClick={() => setIsCreateSaOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create service account</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border-color)] text-xs font-medium">
        <button
          onClick={() => setActiveTab('members')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'members'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Permissions ({members.length})
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'roles'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Roles ({PREDEFINED_ROLES.length})
        </button>
        <button
          onClick={() => setActiveTab('service-accounts')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'service-accounts'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Service accounts ({serviceAccounts.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Audit logs ({auditLogs.length})
        </button>
      </div>

      {/* Tab 1: Permissions (Members Table) */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Filter permissions by principal or role..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>
          </div>

          <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                <tr>
                  <th className="py-3 px-4">Principal</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Assigned Roles</th>
                  <th className="py-3 px-4">Inheritance</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredMembers.map(mem => (
                  <tr key={mem.id} className="hover:bg-[var(--card-hover)] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[var(--text-primary)]">{mem.principal}</div>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {mem.type === 'serviceAccount' ? 'Service Account' : 'User'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {mem.roles.map(role => (
                          <span
                            key={role}
                            className="px-2 py-0.5 rounded bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] border border-[var(--accent-blue-border)] font-mono text-[11px]"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-muted)]">
                      {mem.inheritedFrom || 'Directly granted'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {mem.roles.includes('roles/owner') && members.filter(m => m.roles.includes('roles/owner')).length <= 1 ? (
                        <span className="text-[11px] text-[var(--text-muted)] italic">Primary Owner</span>
                      ) : (
                        <button
                          onClick={() => removeMember(mem.id)}
                          className="p-1 rounded text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
                          title="Revoke member role"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Predefined Roles */}
      {activeTab === 'roles' && (
        <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden">
          <div className="divide-y divide-[var(--border-subtle)]">
            {PREDEFINED_ROLES.map(role => (
              <div key={role.id} className="p-4 hover:bg-[var(--card-hover)] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-[var(--text-primary)]">{role.title}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300 font-mono">
                      {role.category}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">{role.description}</p>
                  <code className="text-[11px] font-mono text-[var(--accent-blue)] block">{role.id}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Service Accounts */}
      {activeTab === 'service-accounts' && (
        <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
              <tr>
                <th className="py-3 px-4">Display Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Key ID status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {serviceAccounts.map(sa => (
                <tr key={sa.id} className="hover:bg-[var(--card-hover)] transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-[var(--text-primary)]">{sa.displayName}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{sa.description}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                    {sa.email}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                      <Key className="w-3 h-3 text-[var(--accent-blue)]" />
                      {sa.keysCount} key(s) created
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      onClick={() => setKeyModalSa(sa.email)}
                      className="px-2.5 py-1 rounded text-xs bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] hover:bg-[var(--accent-blue-border)] font-medium transition-colors inline-flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Create Key</span>
                    </button>
                    <button
                      onClick={() => deleteServiceAccount(sa.id)}
                      className="p-1 rounded text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
                      title="Delete service account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Audit Logs */}
      {activeTab === 'audit' && (
        <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden">
          <div className="p-3 bg-[var(--bg-canvas)] border-b border-[var(--border-color)] flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-primary)]">Cloud Audit Log Stream</span>
            <span>Recorded in LocalCloud emulator</span>
          </div>
          <div className="divide-y divide-[var(--border-subtle)] max-h-96 overflow-y-auto">
            {auditLogs.map(log => (
              <div key={log.id} className="p-3 hover:bg-[var(--card-hover)] transition-colors text-xs space-y-1">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-[var(--accent-blue)]">{log.service}</span>
                  <span className="text-[var(--text-muted)]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--text-primary)]">{log.method}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                    {log.status}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] font-mono truncate">
                  Resource: {log.resourceName}
                </div>
                {log.details && (
                  <div className="text-[11px] text-[var(--text-muted)] italic">
                    Note: {log.details}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grant Access Modal */}
      {isGrantAccessOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsGrantAccessOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                Grant access to &quot;{currentProject.name}&quot;
              </h3>
              <button
                onClick={() => setIsGrantAccessOpen(false)}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGrantAccessSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  New Principals (email address) *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. dev-collaborator@example.com"
                  value={newPrincipal}
                  onChange={e => setNewPrincipal(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  Select a Role *
                </label>
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value as CloudRole)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                >
                  {PREDEFINED_ROLES.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.title} ({role.id})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  {PREDEFINED_ROLES.find(r => r.id === selectedRole)?.description}
                </p>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsGrantAccessOpen(false)}
                  className="px-3 py-1.5 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-secondary)] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newPrincipal.trim()}
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                >
                  Save Access Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Service Account Modal */}
      {isCreateSaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsCreateSaOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                Create service account
              </h3>
              <button
                onClick={() => setIsCreateSaOpen(false)}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSaSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  Service account name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. backend-api-worker"
                  value={saName}
                  onChange={e => setSaName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-blue)]"
                  autoFocus
                />
                <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                  Email will be: {saName || 'name'}@{currentProject.projectId}.iam.gserviceaccount.com
                </span>
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  Service account display name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Backend API Worker"
                  value={saDisplayName}
                  onChange={e => setSaDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Explain what workloads use this identity..."
                  value={saDescription}
                  onChange={e => setSaDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateSaOpen(false)}
                  className="px-3 py-1.5 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-secondary)] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!saName.trim()}
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                >
                  Create and Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Download Key Modal */}
      {keyModalSa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setKeyModalSa(null)}
          />
          <div className="relative z-10 w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/10 text-[var(--accent-blue)]">
                <FileJson className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                  Create private key
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  for {keyModalSa}
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Downloads a simulated GCP service account credentials file in <strong>JSON</strong> format. This can be used with Google Cloud SDKs by setting <code>GOOGLE_APPLICATION_CREDENTIALS</code>.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setKeyModalSa(null)}
                className="px-3 py-1.5 rounded-lg hover:bg-[var(--card-hover)] text-xs text-[var(--text-secondary)] font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDownloadKeyJson(keyModalSa)}
                className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Create &amp; Download</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
