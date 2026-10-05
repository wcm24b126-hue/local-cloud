import React, { useState } from 'react';
import {
  Server,
  Plus,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Terminal,
  Search,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  Activity,
  Box,
  Layers,
} from 'lucide-react';
import { useLocalCloud } from '../../../context/LocalCloudContext';
import { VmInstance, VmStatus } from '../../../types';

export const VmInstancesList: React.FC = () => {
  const {
    vmInstances,
    startVmInstance,
    stopVmInstance,
    resetVmInstance,
    deleteVmInstance,
    connectSshToVm,
    setSelectedVm,
    setActiveView,
    currentProject,
    showToast,
  } = useLocalCloud();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMenuVmId, setActiveMenuVmId] = useState<string | null>(null);
  const [copiedIpId, setCopiedIpId] = useState<string | null>(null);

  const filteredVms = vmInstances.filter(
    vm =>
      vm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vm.zone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vm.machineType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vm.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredVms.map(v => v.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleOpenVmDetails = (vm: VmInstance) => {
    setSelectedVm(vm);
    setActiveView('vm-details', vm.name, 'Compute Engine');
  };

  const handleCopyIp = (ip: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ip);
    setCopiedIpId(id);
    showToast(`Copied ${ip} to clipboard`);
    setTimeout(() => setCopiedIpId(null), 2000);
  };

  const renderStatusChip = (status: VmStatus) => {
    switch (status) {
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Running
          </span>
        );
      case 'PROVISIONING':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-blue-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
            Provisioning...
          </span>
        );
      case 'STAGING':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-blue-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            Staging resources...
          </span>
        );
      case 'STOPPING':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Stopping...
          </span>
        );
      case 'TERMINATED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-medium">
            <span className="w-2 h-2 rounded-full bg-neutral-500" />
            Terminated (Stopped)
          </span>
        );
      case 'REPAIRING':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-spin" />
            Resetting...
          </span>
        );
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border-color)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              VM instances
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">
              Compute Engine
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Virtual machines running in project{' '}
            <span className="font-mono text-[var(--text-primary)]">{currentProject.projectId}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Simulation-only notice. The old Docker backend toggle was removed
              because this emulator never launches containers. */}
          <div
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-muted)] flex items-center gap-1.5"
            title="LocalCloud is simulation-only and never launches containers"
          >
            <Box className="w-3.5 h-3.5" />
            <span>Backend: Simulation only</span>
          </div>

          <button
            onClick={() => setActiveView('vm-create', 'Create VM instance', 'Compute Engine')}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create instance</span>
          </button>
        </div>
      </div>

      {/* Toolbar / Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Filter VM instances by name, zone, or status..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)]"
          />
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  selectedIds.forEach(id => startVmInstance(id));
                }}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-primary)] flex items-center gap-1"
                title="Start selected instances"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                <span>Start</span>
              </button>
              <button
                onClick={() => {
                  selectedIds.forEach(id => stopVmInstance(id));
                }}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-primary)] flex items-center gap-1"
                title="Stop selected instances"
              >
                <Square className="w-3.5 h-3.5 text-amber-400" />
                <span>Stop</span>
              </button>
              <button
                onClick={() => {
                  selectedIds.forEach(id => resetVmInstance(id));
                }}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-primary)] flex items-center gap-1"
                title="Reset selected instances"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete ${selectedIds.length} instance(s)?`)) {
                    selectedIds.forEach(id => deleteVmInstance(id));
                    setSelectedIds([]);
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/10 text-xs font-semibold flex items-center gap-1"
                title="Delete selected instances"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          )}
          <span className="text-xs text-[var(--text-muted)] font-mono">
            {filteredVms.length} instance(s)
          </span>
        </div>
      </div>

      {/* VM Table */}
      <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
        {filteredVms.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[var(--bg-canvas)] border border-[var(--border-color)] flex items-center justify-center mx-auto text-[var(--text-muted)]">
              <Server className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                No VM instances found
              </h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                Create your first virtual machine in Compute Engine to run workloads and services.
              </p>
            </div>
            <button
              onClick={() => setActiveView('vm-create', 'Create VM instance', 'Compute Engine')}
              className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create instance</span>
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
                      checked={selectedIds.length === filteredVms.length && filteredVms.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--accent-blue)] focus:ring-0"
                    />
                  </th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Zone</th>
                  <th className="py-3 px-4">Machine type</th>
                  <th className="py-3 px-4">Internal IP</th>
                  <th className="py-3 px-4">External IP</th>
                  <th className="py-3 px-4">Connect</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredVms.map(vm => {
                  const isChecked = selectedIds.includes(vm.id);
                  const isMenuOpen = activeMenuVmId === vm.id;

                  return (
                    <tr
                      key={vm.id}
                      onClick={() => handleOpenVmDetails(vm)}
                      className={`cursor-pointer transition-colors ${
                        isChecked ? 'bg-[var(--accent-blue-bg)]' : 'hover:bg-[var(--card-hover)]'
                      }`}
                    >
                      <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(vm.id)}
                          className="rounded border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--accent-blue)] focus:ring-0"
                        />
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
                          <span className="font-semibold text-[var(--accent-blue)] hover:underline truncate">
                            {vm.name}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {renderStatusChip(vm.status)}
                      </td>

                      <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                        {vm.zone}
                      </td>

                      <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                        {vm.machineType}
                      </td>

                      <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                        {vm.internalIp}
                      </td>

                      <td className="py-3 px-4 font-mono text-[var(--text-secondary)]" onClick={e => e.stopPropagation()}>
                        {vm.externalIp ? (
                          <div className="flex items-center gap-1.5">
                            <span>{vm.externalIp}</span>
                            <button
                              onClick={e => handleCopyIp(vm.externalIp || '', vm.id, e)}
                              className="p-1 hover:text-[var(--text-primary)] text-[var(--text-muted)] rounded"
                              title="Copy external IP"
                            >
                              {copiedIpId === vm.id ? (
                                <Check className="w-3 h-3 text-[var(--success)]" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)]">None</span>
                        )}
                      </td>

                      <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => connectSshToVm(vm)}
                          disabled={vm.status !== 'RUNNING'}
                          className="px-2.5 py-1 rounded-md bg-[var(--bg-canvas)] hover:bg-[var(--card-hover)] border border-[var(--border-color)] text-[var(--text-primary)] hover:text-[var(--accent-blue)] font-medium text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40"
                          title="Connect in browser SSH"
                        >
                          <Terminal className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                          <span>SSH</span>
                        </button>
                      </td>

                      <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="relative inline-block text-left">
                          <button
                            onClick={() => setActiveMenuVmId(isMenuOpen ? null : vm.id)}
                            className="p-1.5 rounded-full hover:bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {isMenuOpen && (
                            <div className="absolute right-0 mt-1 w-36 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-2xl py-1 z-30 text-xs">
                              {vm.status === 'RUNNING' ? (
                                <button
                                  onClick={() => {
                                    stopVmInstance(vm.id);
                                    setActiveMenuVmId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--card-hover)] text-[var(--text-primary)] flex items-center gap-2"
                                >
                                  <Square className="w-3 h-3 text-amber-400" />
                                  <span>Stop</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    startVmInstance(vm.id);
                                    setActiveMenuVmId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--card-hover)] text-[var(--text-primary)] flex items-center gap-2"
                                >
                                  <Play className="w-3 h-3 text-emerald-400" />
                                  <span>Start</span>
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  resetVmInstance(vm.id);
                                  setActiveMenuVmId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-[var(--card-hover)] text-[var(--text-primary)] flex items-center gap-2"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Reset</span>
                              </button>

                              <button
                                onClick={() => {
                                  handleOpenVmDetails(vm);
                                  setActiveMenuVmId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-[var(--card-hover)] text-[var(--text-primary)] flex items-center gap-2"
                              >
                                <Activity className="w-3 h-3" />
                                <span>Details</span>
                              </button>

                              <div className="border-t border-[var(--border-subtle)] my-1" />

                              <button
                                onClick={() => {
                                  if (confirm(`Delete instance ${vm.name}?`)) {
                                    deleteVmInstance(vm.id);
                                  }
                                  setActiveMenuVmId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-[var(--danger)]/10 text-[var(--danger)] flex items-center gap-2"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
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
