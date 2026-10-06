import React, { useState } from 'react';
import {
  ArrowLeft,
  Server,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Terminal,
  Activity,
  HardDrive,
  Network,
  Shield,
  FileText,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Cpu,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useLocalCloud } from '../../../context/LocalCloudContext';
import { VmInstance, VmStatus } from '../../../types';

export const VmDetailsView: React.FC = () => {
  const {
    selectedVm,
    vmInstances,
    startVmInstance,
    stopVmInstance,
    resetVmInstance,
    deleteVmInstance,
    connectSshToVm,
    setActiveView,
    firewallRules,
    showToast,
  } = useLocalCloud();

  // Find freshest VM data
  const vm = vmInstances.find(v => v.id === selectedVm?.id) || selectedVm;

  const [activeTab, setActiveTab] = useState<'details' | 'monitoring' | 'serial' | 'firewalls'>('details');
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [monitoringTimeRange, setMonitoringTimeRange] = useState<'1h' | '6h' | '24h'>('1h');
  const [serialLogsCopied, setSerialLogsCopied] = useState(false);

  if (!vm) {
    return (
      <div className="py-16 text-center space-y-4">
        <Server className="w-12 h-12 text-[var(--text-muted)] mx-auto" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">No VM Instance Selected</h2>
        <button
          onClick={() => setActiveView('compute', 'VM instances', 'Compute Engine')}
          className="px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-black text-xs font-semibold"
        >
          Back to VM instances
        </button>
      </div>
    );
  }

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIp(label);
    showToast(`Copied ${label} to clipboard`);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  const renderStatusBadge = (status: VmStatus) => {
    switch (status) {
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            RUNNING
          </span>
        );
      case 'PROVISIONING':
      case 'STAGING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
            {status}
          </span>
        );
      case 'STOPPING':
      case 'REPAIRING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-spin" />
            {status}
          </span>
        );
      case 'TERMINATED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-800 text-[var(--text-muted)] border border-neutral-700">
            <span className="w-2 h-2 rounded-full bg-neutral-500" />
            TERMINATED (STOPPED)
          </span>
        );
    }
  };

  // Mock Linux kernel serial console boot logs
  const serialBootLogs = `[    0.000000] Linux version 6.1.0-18-amd64 (debian-kernel@lists.debian.org) #1 SMP PREEMPT_DYNAMIC
[    0.000000] Command line: BOOT_IMAGE=/boot/vmlinuz-6.1.0-18-amd64 root=UUID=7427cf61-396a ro console=ttyS0,38400n8 earlyprintk=ttyS0,38400
[    0.000000] KERNEL supported cpus: Intel, AMD, Hygon
[    0.000000] x86/fpu: Supporting XSAVE feature 0x001: 'x87 floating point registers'
[    0.000000] Hypervisor detected: Google Compute Engine (LocalCloud Emulator)
[    0.004120] ACPI: Core revision 20221020
[    0.021004] Memory: ${vm.memoryGb * 1024 * 1024}K available
[    0.120441] smpboot: CPU0: ${vm.cpuCount} vCPUs configured
[    0.342110] PCI: Using configuration type 1 for base access
[    0.410982] scsi host0: virtio_scsi boot disk: ${vm.bootDiskSizeGb} GB (${vm.bootDiskType})
[    0.512034] virtio_net virtio1: eth0: internal IP ${vm.internalIp} subnet ${vm.subnetName}
[    0.890123] systemd[1]: Inserted module 'autofs4'
[    1.012300] systemd[1]: Detected architecture x86-64.
[    1.214050] systemd[1]: Starting Google Compute Engine guest environment...
[    1.420100] google_guest_agent[420]: GCE Agent v2026.04.14 active on ${vm.name}.${vm.zone}.c.localcloud.internal
[    1.501200] google_guest_agent[420]: Provisioned SSH keys for user student@localcloud.dev
[    1.621000] systemd[1]: Started OpenSSH Server Daemon. Listening on 0.0.0.0:22.
[    1.802100] systemd[1]: Reached target Multi-User System.
[    2.001000] LocalCloud guest: Instance status transition => RUNNING. Ready for connections.`;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header and Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveView('compute', 'VM instances', 'Compute Engine')}
            className="p-1.5 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
                {vm.name}
              </h1>
              {renderStatusBadge(vm.status)}
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-mono">
              Zone: <span className="text-[var(--text-primary)]">{vm.zone}</span> • Machine type: <span className="text-[var(--text-primary)]">{vm.machineType}</span>
            </p>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => connectSshToVm(vm)}
            disabled={vm.status !== 'RUNNING'}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-40"
            title="Connect in browser SSH terminal"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>SSH</span>
          </button>

          {vm.status === 'RUNNING' ? (
            <button
              onClick={() => stopVmInstance(vm.id)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-primary)] flex items-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5 text-amber-400" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={() => startVmInstance(vm.id)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-primary)] flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <span>Start</span>
            </button>
          )}

          <button
            onClick={() => resetVmInstance(vm.id)}
            disabled={vm.status !== 'RUNNING'}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-primary)] flex items-center gap-1.5 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            onClick={() => {
              if (confirm(`Delete instance ${vm.name}? This action cannot be undone.`)) {
                deleteVmInstance(vm.id);
                setActiveView('compute', 'VM instances', 'Compute Engine');
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
          { id: 'details', label: 'Details', icon: FileText },
          { id: 'monitoring', label: 'Monitoring', icon: Activity },
          { id: 'serial', label: 'Serial Port 1 (Console)', icon: Terminal },
          { id: 'firewalls', label: 'Network & Firewalls', icon: Shield },
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

      {/* Tab Content */}
      {activeTab === 'details' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Machine configuration */}
          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 space-y-4">
            <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[var(--accent-blue)]" />
              <span>Hardware & Configuration</span>
            </h3>

            <div className="space-y-3 text-xs divide-y divide-[var(--border-subtle)]">
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">Machine type</span>
                <span className="font-mono text-[var(--text-primary)] font-semibold">{vm.machineType}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">vCPUs to core ratio</span>
                <span className="font-mono text-[var(--text-primary)]">{vm.cpuCount} vCPUs</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">Total memory</span>
                <span className="font-mono text-[var(--text-primary)]">{vm.memoryGb} GB</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">CPU architecture</span>
                <span className="font-mono text-[var(--text-primary)]">x86/64 (Intel Broadwell / Skylake)</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">Zone</span>
                <span className="font-mono text-[var(--text-primary)]">{vm.zone}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Storage & Boot Disk */}
          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 space-y-4">
            <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[var(--accent-blue)]" />
              <span>Storage & Boot Disk</span>
            </h3>

            <div className="space-y-3 text-xs divide-y divide-[var(--border-subtle)]">
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">OS Image</span>
                <span className="font-mono text-[var(--text-primary)] font-semibold">{vm.osImage}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">Boot disk size</span>
                <span className="font-mono text-[var(--text-primary)]">{vm.bootDiskSizeGb} GB</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">Disk type</span>
                <span className="font-mono text-[var(--text-primary)]">{vm.bootDiskType}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">Auto-delete on VM delete</span>
                <span className="font-mono text-emerald-400">Yes</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">Encryption</span>
                <span className="font-mono text-[var(--text-primary)]">Google-managed key</span>
              </div>
            </div>
          </div>

          {/* Card 3: Network Interfaces */}
          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 space-y-4">
            <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Network className="w-4 h-4 text-[var(--accent-blue)]" />
              <span>Network Interfaces</span>
            </h3>

            <div className="space-y-3 text-xs divide-y divide-[var(--border-subtle)]">
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">Network</span>
                <span className="font-mono text-[var(--text-primary)]">{vm.networkName}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">Subnetwork</span>
                <span className="font-mono text-[var(--text-primary)]">{vm.subnetName}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-[var(--text-secondary)]">Internal IP (Private)</span>
                <div className="flex items-center gap-1.5 font-mono text-[var(--text-primary)]">
                  <span>{vm.internalIp}</span>
                  <button
                    onClick={() => handleCopy(vm.internalIp, 'internal IP')}
                    className="p-1 hover:text-[var(--text-primary)] text-[var(--text-muted)] rounded"
                  >
                    {copiedIp === 'internal IP' ? <Check className="w-3 h-3 text-[var(--success)]" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-[var(--text-secondary)]">External IP (NAT)</span>
                <div className="flex items-center gap-1.5 font-mono text-[var(--text-primary)]">
                  <span>{vm.externalIp || 'None'}</span>
                  {vm.externalIp && (
                    <button
                      onClick={() => handleCopy(vm.externalIp || '', 'external IP')}
                      className="p-1 hover:text-[var(--text-primary)] text-[var(--text-muted)] rounded"
                    >
                      {copiedIp === 'external IP' ? <Check className="w-3 h-3 text-[var(--success)]" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">Network tags</span>
                <span className="font-mono text-[var(--text-primary)]">
                  {vm.networkTags.length > 0 ? vm.networkTags.join(', ') : 'None'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Identity & Security */}
          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 space-y-4">
            <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--accent-blue)]" />
              <span>Identity & API Access</span>
            </h3>

            <div className="space-y-3 text-xs divide-y divide-[var(--border-subtle)]">
              <div className="py-1.5 space-y-1">
                <span className="text-[var(--text-secondary)] block">Service account</span>
                <span className="font-mono text-[var(--text-primary)] break-all">{vm.serviceAccountEmail || 'Default'}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">Cloud API access scopes</span>
                <span className="font-mono text-[var(--text-primary)]">Allow default access</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">HTTP traffic</span>
                <span className={vm.allowHttp ? 'text-emerald-400 font-semibold' : 'text-[var(--text-muted)]'}>
                  {vm.allowHttp ? 'Allowed (port 80)' : 'Blocked'}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--text-secondary)]">HTTPS traffic</span>
                <span className={vm.allowHttps ? 'text-emerald-400 font-semibold' : 'text-[var(--text-muted)]'}>
                  {vm.allowHttps ? 'Allowed (port 443)' : 'Blocked'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Monitoring */}
      {activeTab === 'monitoring' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)]">Time window:</span>
              {(['1h', '6h', '24h'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setMonitoringTimeRange(range)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                    monitoringTimeRange === range
                      ? 'bg-[var(--accent-blue)] text-black font-semibold'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-color)]'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            <button
              onClick={() => showToast('Metrics refreshed')}
              className="px-2.5 py-1 rounded-md border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-secondary)] flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Chart 1: CPU Utilization */}
            <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-5 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-[var(--text-primary)]">CPU Utilization (%)</span>
                <span className="font-mono text-emerald-400">
                  {vm.status === 'RUNNING' ? '2.4 %' : '0.0 %'}
                </span>
              </div>

              {/* Simulated SVG Graph */}
              <div className="h-40 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] p-3 relative flex items-end">
                <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                  <path
                    d={
                      vm.status === 'RUNNING'
                        ? 'M 0 85 Q 30 75, 60 82 T 120 70 T 180 65 T 240 78 T 300 68'
                        : 'M 0 98 L 300 98'
                    }
                    fill="none"
                    stroke="#8ab4f8"
                    strokeWidth="2.5"
                  />
                  <path
                    d={
                      vm.status === 'RUNNING'
                        ? 'M 0 85 Q 30 75, 60 82 T 120 70 T 180 65 T 240 78 T 300 68 L 300 100 L 0 100 Z'
                        : 'M 0 98 L 300 98 L 300 100 L 0 100 Z'
                    }
                    fill="url(#blueGradient)"
                    opacity="0.2"
                  />
                  <defs>
                    <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8ab4f8" />
                      <stop offset="100%" stopColor="#8ab4f8" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            {/* Chart 2: Network Traffic */}
            <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-5 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-[var(--text-primary)]">Network Bytes (KiB/s)</span>
                <span className="font-mono text-blue-400">
                  {vm.status === 'RUNNING' ? '14.2 KiB/s' : '0.0 KiB/s'}
                </span>
              </div>

              <div className="h-40 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] p-3 relative flex items-end">
                <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                  <path
                    d={
                      vm.status === 'RUNNING'
                        ? 'M 0 90 Q 40 85, 80 50 T 160 88 T 240 60 T 300 75'
                        : 'M 0 98 L 300 98'
                    }
                    fill="none"
                    stroke="#34D399"
                    strokeWidth="2.5"
                  />
                </svg>
              </div>
            </div>

            {/* Chart 3: Disk Throughput */}
            <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-5 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-[var(--text-primary)]">Disk IOPS</span>
                <span className="font-mono text-purple-400">
                  {vm.status === 'RUNNING' ? '12 IOPS' : '0 IOPS'}
                </span>
              </div>

              <div className="h-40 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] p-3 relative flex items-end">
                <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                  <path
                    d={
                      vm.status === 'RUNNING'
                        ? 'M 0 92 Q 50 90, 100 80 T 200 88 T 300 84'
                        : 'M 0 98 L 300 98'
                    }
                    fill="none"
                    stroke="#FBBF24"
                    strokeWidth="2.5"
                  />
                </svg>
              </div>
            </div>

            {/* Health status */}
            <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-5 space-y-3">
              <span className="text-xs font-semibold text-[var(--text-primary)]">System Health Status</span>
              <div className="p-4 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Instance is operating normally</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Hypervisor health checks and guest environment heartbeats are reporting healthy.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Serial Console Logs */}
      {activeTab === 'serial' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-secondary)]">
              Output from Serial Port 1 (console). Useful for troubleshooting kernel and bootloader errors.
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(serialBootLogs);
                setSerialLogsCopied(true);
                showToast('Console logs copied to clipboard');
                setTimeout(() => setSerialLogsCopied(false), 2000);
              }}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-primary)] flex items-center gap-1.5"
            >
              {serialLogsCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy logs</span>
                </>
              )}
            </button>
          </div>

          <div className="rounded-2xl bg-black border border-neutral-800 p-4 font-mono text-xs text-neutral-300 overflow-x-auto max-h-[500px] overflow-y-auto leading-relaxed select-text shadow-inner">
            <pre>{serialBootLogs}</pre>
          </div>
        </div>
      )}

      {/* Tab 4: Firewalls */}
      {activeTab === 'firewalls' && (
        <div className="space-y-4">
          <div className="text-xs text-[var(--text-secondary)]">
            Firewall rules in the network <span className="font-mono text-[var(--text-primary)]">{vm.networkName}</span> that apply to this instance:
          </div>

          <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                <tr>
                  <th className="py-3 px-4">Firewall rule</th>
                  <th className="py-3 px-4">Direction</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Targets</th>
                  <th className="py-3 px-4">Protocols and ports</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                {firewallRules
                  .filter(fw => fw.networkName === vm.networkName)
                  .map(rule => (
                    <tr key={rule.id} className="hover:bg-[var(--card-hover)]">
                      <td className="py-3 px-4 font-sans font-semibold text-[var(--accent-blue)]">
                        {rule.name}
                      </td>
                      <td className="py-3 px-4">{rule.direction}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {rule.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">{rule.targets}</td>
                      <td className="py-3 px-4 text-[var(--text-primary)]">{rule.protocolsAndPorts}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
