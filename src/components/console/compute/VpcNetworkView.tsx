import React, { useState } from 'react';
import {
  Network,
  Shield,
  Plus,
  Trash2,
  Search,
  ExternalLink,
  Layers,
  ArrowRight,
  Globe,
  Lock,
  CheckCircle2,
  X,
  AlertCircle,
} from 'lucide-react';
import { useLocalCloud } from '../../../context/LocalCloudContext';
import { VpcFirewallRule } from '../../../types';

export const VpcNetworkView: React.FC = () => {
  const {
    vpcNetworks,
    vpcSubnets,
    firewallRules,
    createFirewallRule,
    deleteFirewallRule,
    currentProject,
    showToast,
  } = useLocalCloud();

  const [activeTab, setActiveTab] = useState<'networks' | 'subnets' | 'firewalls'>('firewalls');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateRuleModalOpen, setIsCreateRuleModalOpen] = useState(false);

  // New rule form state
  const [ruleName, setRuleName] = useState('');
  const [direction, setDirection] = useState<'INGRESS' | 'EGRESS'>('INGRESS');
  const [priority, setPriority] = useState(1000);
  const [action, setAction] = useState<'ALLOW' | 'DENY'>('ALLOW');
  const [targets, setTargets] = useState('Apply to all');
  const [sourceRanges, setSourceRanges] = useState('0.0.0.0/0');
  const [protocolsAndPorts, setProtocolsAndPorts] = useState('tcp:8080');
  const [description, setDescription] = useState('');

  const filteredRules = firewallRules.filter(
    r =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.protocolsAndPorts.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.targets.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;

    createFirewallRule({
      name: ruleName.trim().toLowerCase(),
      direction,
      priority,
      action,
      targets,
      sourceRanges,
      protocolsAndPorts,
      description,
    });

    setIsCreateRuleModalOpen(false);
    // Reset form
    setRuleName('');
    setProtocolsAndPorts('tcp:8080');
    setDescription('');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              VPC network
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">
              Networking
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Software-defined virtual networks and distributed firewall protection for project{' '}
            <span className="font-mono text-[var(--text-primary)]">{currentProject.projectId}</span>
          </p>
        </div>

        {activeTab === 'firewalls' && (
          <button
            onClick={() => setIsCreateRuleModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create firewall rule</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-[var(--border-color)] text-xs font-medium">
        {[
          { id: 'firewalls', label: 'Firewall rules', icon: Shield },
          { id: 'subnets', label: 'Subnets', icon: Layers },
          { id: 'networks', label: 'VPC networks', icon: Network },
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

      {/* Tab 1: Firewall Rules */}
      {activeTab === 'firewalls' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative max-w-sm flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter firewall rules..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {filteredRules.length} rule(s)
            </span>
          </div>

          <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                <tr>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Targets</th>
                  <th className="py-3 px-4">Source IP ranges</th>
                  <th className="py-3 px-4">Protocols / Ports</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4 text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                {filteredRules.map(rule => (
                  <tr key={rule.id} className="hover:bg-[var(--card-hover)] transition-colors">
                    <td className="py-3 px-4 font-sans font-semibold text-[var(--accent-blue)]">
                      {rule.name}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {rule.direction}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {rule.targets}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)]">
                      {rule.sourceRanges}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)]">
                      {rule.protocolsAndPorts}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          rule.action === 'ALLOW'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {rule.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {rule.priority}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`Delete firewall rule "${rule.name}"?`)) {
                            deleteFirewallRule(rule.id);
                          }
                        }}
                        className="p-1 hover:text-[var(--danger)] text-[var(--text-muted)] transition-colors"
                        title="Delete rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Subnets */}
      {activeTab === 'subnets' && (
        <div className="space-y-4">
          <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                <tr>
                  <th className="py-3 px-4">Subnet name</th>
                  <th className="py-3 px-4">Region</th>
                  <th className="py-3 px-4">VPC network</th>
                  <th className="py-3 px-4">Primary IPv4 range</th>
                  <th className="py-3 px-4">Gateway</th>
                  <th className="py-3 px-4">Private Google Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                {vpcSubnets.map(sub => (
                  <tr key={sub.id} className="hover:bg-[var(--card-hover)] transition-colors">
                    <td className="py-3 px-4 font-sans font-semibold text-[var(--accent-blue)]">
                      {sub.name}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{sub.region}</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{sub.networkName}</td>
                    <td className="py-3 px-4 text-[var(--text-primary)] font-bold">{sub.ipCidrRange}</td>
                    <td className="py-3 px-4 text-[var(--text-muted)]">
                      {sub.ipCidrRange.replace('0/20', '1')}
                    </td>
                    <td className="py-3 px-4 font-sans text-emerald-400">On</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Networks */}
      {activeTab === 'networks' && (
        <div className="space-y-4">
          <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                <tr>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Subnets</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">MTU</th>
                  <th className="py-3 px-4">Gateway IPv4</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {vpcNetworks.map(net => (
                  <tr key={net.id} className="hover:bg-[var(--card-hover)] transition-colors">
                    <td className="py-3 px-4 font-semibold text-[var(--accent-blue)]">
                      {net.name}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] font-mono">{net.subnetCount} subnets</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">Auto</td>
                    <td className="py-3 px-4 font-mono text-[var(--text-primary)]">{net.mtu}</td>
                    <td className="py-3 px-4 font-mono text-[var(--text-muted)]">10.128.0.1</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Firewall Rule Modal */}
      {isCreateRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[var(--accent-blue)]" />
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                  Create a firewall rule
                </h3>
              </div>
              <button
                onClick={() => setIsCreateRuleModalOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. allow-custom-api"
                  value={ruleName}
                  onChange={e => setRuleName(e.target.value.toLowerCase())}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Optional rule description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Direction of traffic
                  </label>
                  <select
                    value={direction}
                    onChange={e => setDirection(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  >
                    <option value="INGRESS">Ingress (incoming)</option>
                    <option value="EGRESS">Egress (outgoing)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Action on match
                  </label>
                  <select
                    value={action}
                    onChange={e => setAction(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  >
                    <option value="ALLOW">Allow</option>
                    <option value="DENY">Deny</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Priority (1-65535)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={priority}
                    onChange={e => setPriority(parseInt(e.target.value) || 1000)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Targets
                  </label>
                  <input
                    type="text"
                    value={targets}
                    onChange={e => setTargets(e.target.value)}
                    placeholder="Apply to all or specified tag"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Source IPv4 ranges
                </label>
                <input
                  type="text"
                  required
                  value={sourceRanges}
                  onChange={e => setSourceRanges(e.target.value)}
                  placeholder="0.0.0.0/0"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Protocols and ports
                </label>
                <input
                  type="text"
                  required
                  value={protocolsAndPorts}
                  onChange={e => setProtocolsAndPorts(e.target.value)}
                  placeholder="tcp:8080 or tcp:80,443 or icmp"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsCreateRuleModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[var(--accent-blue)] text-black font-semibold hover:bg-[var(--accent-hover)]"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
