import React, { useState, useId } from 'react';
import {
  ArrowLeft,
  Server,
  HelpCircle,
  CheckCircle2,
  HardDrive,
  Shield,
  Network,
  Cpu,
  Terminal,
  Copy,
  Check,
  Code2,
  AlertTriangle,
  Info,
  DollarSign,
  Sparkles,
} from 'lucide-react';
import { useLocalCloud } from '../../../context/LocalCloudContext';
import { DiskType, MachineFamily, VmInstance } from '../../../types';

interface OsImageOption {
  id: string;
  name: string;
  family: string;
  project: string;
  sizeGb: number;
}

const OS_OPTIONS: OsImageOption[] = [
  { id: 'debian-12', name: 'Debian GNU/Linux 12 (bookworm)', family: 'debian-12', project: 'debian-cloud', sizeGb: 10 },
  { id: 'ubuntu-2204', name: 'Ubuntu 22.04 LTS (Jammy Jellyfish)', family: 'ubuntu-2204-lts', project: 'ubuntu-os-cloud', sizeGb: 10 },
  { id: 'rhel-9', name: 'Red Hat Enterprise Linux 9', family: 'rhel-9', project: 'rhel-cloud', sizeGb: 20 },
  { id: 'rocky-9', name: 'Rocky Linux 9', family: 'rocky-linux-9', project: 'rocky-linux-cloud', sizeGb: 20 },
  { id: 'windows-2022', name: 'Windows Server 2022 Datacenter', family: 'windows-2022', project: 'windows-cloud', sizeGb: 50 },
];

interface MachineOption {
  id: string;
  family: MachineFamily;
  series: string;
  name: string;
  vCpus: number;
  memoryGb: number;
  hourlyPrice: number;
  monthlyPrice: number;
  freeTierEligible?: boolean;
}

const MACHINE_OPTIONS: MachineOption[] = [
  { id: 'e2-micro', family: 'GENERAL_PURPOSE', series: 'E2', name: 'e2-micro (2 vCPU, 1 core, 1 GB memory)', vCpus: 2, memoryGb: 1, hourlyPrice: 0.0097, monthlyPrice: 7.11, freeTierEligible: true },
  { id: 'e2-small', family: 'GENERAL_PURPOSE', series: 'E2', name: 'e2-small (2 vCPU, 1 core, 2 GB memory)', vCpus: 2, memoryGb: 2, hourlyPrice: 0.0195, monthlyPrice: 14.22 },
  { id: 'e2-medium', family: 'GENERAL_PURPOSE', series: 'E2', name: 'e2-medium (2 vCPU, 1 core, 4 GB memory)', vCpus: 2, memoryGb: 4, hourlyPrice: 0.0390, monthlyPrice: 28.44 },
  { id: 'e2-standard-2', family: 'GENERAL_PURPOSE', series: 'E2', name: 'e2-standard-2 (2 vCPU, 8 GB memory)', vCpus: 2, memoryGb: 8, hourlyPrice: 0.0734, monthlyPrice: 53.61 },
  { id: 'e2-standard-4', family: 'GENERAL_PURPOSE', series: 'E2', name: 'e2-standard-4 (4 vCPU, 16 GB memory)', vCpus: 4, memoryGb: 16, hourlyPrice: 0.1468, monthlyPrice: 107.22 },
  { id: 'n2-standard-2', family: 'GENERAL_PURPOSE', series: 'N2', name: 'n2-standard-2 (2 vCPU, 8 GB memory)', vCpus: 2, memoryGb: 8, hourlyPrice: 0.0971, monthlyPrice: 70.88 },
  { id: 'n2-standard-4', family: 'GENERAL_PURPOSE', series: 'N2', name: 'n2-standard-4 (4 vCPU, 16 GB memory)', vCpus: 4, memoryGb: 16, hourlyPrice: 0.1942, monthlyPrice: 141.76 },
  { id: 'c2-standard-4', family: 'COMPUTE_OPTIMIZED', series: 'C2', name: 'c2-standard-4 (4 vCPU, 16 GB memory)', vCpus: 4, memoryGb: 16, hourlyPrice: 0.2088, monthlyPrice: 152.42 },
  { id: 'c2-standard-8', family: 'COMPUTE_OPTIMIZED', series: 'C2', name: 'c2-standard-8 (8 vCPU, 32 GB memory)', vCpus: 8, memoryGb: 32, hourlyPrice: 0.4176, monthlyPrice: 304.85 },
  { id: 'm2-ultramem-208', family: 'MEMORY_OPTIMIZED', series: 'M2', name: 'm2-ultramem-208 (208 vCPU, 5.8 TB memory)', vCpus: 208, memoryGb: 5888, hourlyPrice: 42.15, monthlyPrice: 30770.0 },
];

export const CreateVmInstanceView: React.FC = () => {
  const {
    currentProject,
    createVmInstance,
    setActiveView,
    serviceAccounts,
    isBillingEnabledForCurrentProject,
    showToast,
  } = useLocalCloud();

  // Basic Details
  const [vmName, setVmName] = useState('instance-1');
  const [description, setDescription] = useState('');
  const [region, setRegion] = useState('us-central1');
  const [zone, setZone] = useState('us-central1-a');

  // Machine Configuration
  const [selectedFamily, setSelectedFamily] = useState<MachineFamily>('GENERAL_PURPOSE');
  const [selectedSeries, setSelectedSeries] = useState('E2');
  const [selectedMachineType, setSelectedMachineType] = useState('e2-micro');

  // Boot Disk
  const [isChangingDisk, setIsChangingDisk] = useState(false);
  const [selectedOs, setSelectedOs] = useState(OS_OPTIONS[0]);
  const [bootDiskType, setBootDiskType] = useState<DiskType>('pd-balanced');
  const [bootDiskSizeGb, setBootDiskSizeGb] = useState(10);

  // Firewall & Networking
  const [allowHttp, setAllowHttp] = useState(true);
  const [allowHttps, setAllowHttps] = useState(true);
  const [networkTags, setNetworkTags] = useState('http-server, https-server');
  const [selectedServiceAccount, setSelectedServiceAccount] = useState(
    `${currentProject.projectNumber}-compute@developer.gserviceaccount.com`
  );

  // Code modal
  const [showEquivalentCode, setShowEquivalentCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Filter machines by family
  const availableMachines = MACHINE_OPTIONS.filter(m => m.family === selectedFamily);
  const currentMachine = MACHINE_OPTIONS.find(m => m.id === selectedMachineType) || MACHINE_OPTIONS[0];

  // Pricing calculations
  const diskRatePerGb = bootDiskType === 'pd-standard' ? 0.04 : bootDiskType === 'pd-balanced' ? 0.10 : 0.17;
  const diskMonthlyCost = bootDiskSizeGb * diskRatePerGb;
  const totalMonthlyCost = currentMachine.monthlyPrice + diskMonthlyCost;
  const totalHourlyCost = currentMachine.hourlyPrice + (diskMonthlyCost / 730);

  const isFreeTier = currentMachine.freeTierEligible && region.startsWith('us-');

  // Name validation
  const nameError = !/^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/.test(vmName)
    ? 'Name must be 1-63 characters, start with a lowercase letter, and contain only lowercase letters, numbers, and hyphens.'
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameError) return;

    if (!isBillingEnabledForCurrentProject) {
      showToast('Billing must be enabled for this project to launch Compute Engine VMs');
      setActiveView('billing');
      return;
    }

    const tags = networkTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    createVmInstance({
      name: vmName,
      description,
      zone,
      machineType: currentMachine.id,
      cpuCount: currentMachine.vCpus,
      memoryGb: currentMachine.memoryGb,
      osImage: selectedOs.name,
      bootDiskSizeGb,
      bootDiskType,
      allowHttp,
      allowHttps,
      networkTags: tags,
      serviceAccountEmail: selectedServiceAccount,
      networkName: 'default',
      subnetName: `default-${region}`,
    });

    setActiveView('compute', 'VM instances', 'Compute Engine');
  };

  const equivalentGcloud = `gcloud compute instances create ${vmName} \\
    --project=${currentProject.projectId} \\
    --zone=${zone} \\
    --machine-type=${currentMachine.id} \\
    --network-interface=network-tier=PREMIUM,stack-type=IPV4_ONLY,subnet=default-${region} \\
    --image-family=${selectedOs.family} \\
    --image-project=${selectedOs.project} \\
    --boot-disk-size=${bootDiskSizeGb}GB \\
    --boot-disk-type=${bootDiskType} \\
    --boot-disk-device-name=${vmName} \\
    ${allowHttp || allowHttps ? `--tags=${[allowHttp && 'http-server', allowHttps && 'https-server'].filter(Boolean).join(',')}` : ''}`;

  const copyCode = () => {
    navigator.clipboard.writeText(equivalentGcloud);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Top Banner Navigation */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveView('compute', 'VM instances', 'Compute Engine')}
            className="p-1.5 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
                Create an instance
              </h1>
              <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">
                Compute Engine
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Compute Engine instances run Google virtual machines on demand with customizable hardware.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowEquivalentCode(true)}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--accent-blue)] font-medium transition-colors"
        >
          <Code2 className="w-4 h-4" />
          <span>EQUIVALENT CODE</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Configuration Form (8 cols on lg) */}
        <form onSubmit={handleSubmit} className="lg:col-span-8 space-y-8">
          {/* Section 1: Basic Information */}
          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 space-y-5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4 text-[var(--accent-blue)]" />
              <span>Instance Details</span>
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={vmName}
                  onChange={e => setVmName(e.target.value.toLowerCase())}
                  placeholder="e.g. web-server-1"
                  className={`w-full max-w-md px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 ${
                    nameError
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-[var(--border-color)] focus:border-[var(--accent-blue)] focus:ring-[var(--accent-blue)]'
                  }`}
                  required
                />
                {nameError ? (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{nameError}</span>
                  </p>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Used to identify the instance. Matches RFC 1035 format.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description of this virtual machine workload"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              {/* Region and Zone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Region <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={region}
                    onChange={e => {
                      const reg = e.target.value;
                      setRegion(reg);
                      setZone(`${reg}-a`);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  >
                    <option value="us-central1">us-central1 (Iowa) - Low CO2</option>
                    <option value="us-east1">us-east1 (South Carolina)</option>
                    <option value="europe-west1">europe-west1 (Belgium) - Low CO2</option>
                    <option value="asia-east1">asia-east1 (Taiwan)</option>
                  </select>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Free tier available in us-central1 and us-east1
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Zone <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={zone}
                    onChange={e => setZone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  >
                    <option value={`${region}-a`}>{region}-a</option>
                    <option value={`${region}-b`}>{region}-b</option>
                    <option value={`${region}-c`}>{region}-c</option>
                    <option value={`${region}-f`}>{region}-f</option>
                  </select>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Independent failure domain in {region}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Machine Configuration */}
          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[var(--accent-blue)]" />
                <span>Machine Configuration</span>
              </h2>
              <span className="text-xs font-mono text-[var(--accent-blue)] bg-[var(--accent-blue-bg)] px-2.5 py-0.5 rounded-full border border-[var(--accent-blue-border)]">
                {currentMachine.vCpus} vCPU, {currentMachine.memoryGb} GB RAM
              </span>
            </div>

            {/* Family Tabs */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                  Machine Family
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'GENERAL_PURPOSE', label: 'General-purpose', desc: 'Day-to-day web, DB, dev' },
                    { id: 'COMPUTE_OPTIMIZED', label: 'Compute-optimized', desc: 'High CPU, gaming, HPC' },
                    { id: 'MEMORY_OPTIMIZED', label: 'Memory-optimized', desc: 'Ultra-large in-memory' },
                  ].map(fam => {
                    const isSelected = selectedFamily === fam.id;
                    return (
                      <button
                        key={fam.id}
                        type="button"
                        onClick={() => {
                          setSelectedFamily(fam.id as MachineFamily);
                          const firstOfFam = MACHINE_OPTIONS.find(m => m.family === fam.id);
                          if (firstOfFam) {
                            setSelectedSeries(firstOfFam.series);
                            setSelectedMachineType(firstOfFam.id);
                          }
                        }}
                        className={`p-3 text-left rounded-xl border transition-colors ${
                          isSelected
                            ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-bg)] text-[var(--text-primary)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-subtle)]'
                        }`}
                      >
                        <div className="font-semibold text-xs text-[var(--text-primary)]">{fam.label}</div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{fam.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Machine Type Selection */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Machine Type <span className="text-red-400">*</span>
                </label>
                <div className="space-y-2">
                  <select
                    value={selectedMachineType}
                    onChange={e => setSelectedMachineType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  >
                    {availableMachines.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} — ${m.monthlyPrice.toFixed(2)}/mo {m.freeTierEligible ? '(Free Tier Eligible)' : ''}
                      </option>
                    ))}
                  </select>

                  <div className="p-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] space-y-1">
                    <div className="flex items-center justify-between text-[var(--text-primary)] font-medium">
                      <span>{currentMachine.name}</span>
                      <span className="font-mono text-[var(--accent-blue)]">${currentMachine.hourlyPrice.toFixed(4)}/hr</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      CPU platform: Intel or AMD x86/64 hardware emulation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Boot Disk */}
          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[var(--accent-blue)]" />
                <span>Boot Disk</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsChangingDisk(!isChangingDisk)}
                className="text-xs text-[var(--accent-blue)] hover:underline font-semibold"
              >
                {isChangingDisk ? 'Close configuration' : 'Change OS / Size'}
              </button>
            </div>

            {/* Current Disk Card */}
            <div className="p-4 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="font-semibold text-xs text-[var(--text-primary)] flex items-center gap-2">
                  <span>{selectedOs.name}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-[var(--text-secondary)]">x86/64</span>
                </div>
                <div className="text-xs text-[var(--text-secondary)] flex items-center gap-3">
                  <span>Size: <strong className="text-[var(--text-primary)]">{bootDiskSizeGb} GB</strong></span>
                  <span>•</span>
                  <span>Type: <strong className="text-[var(--text-primary)]">{bootDiskType}</strong></span>
                  <span>•</span>
                  <span>Est: <strong className="text-[var(--text-primary)]">${diskMonthlyCost.toFixed(2)}/mo</strong></span>
                </div>
              </div>

              <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full shrink-0 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Bootable disk</span>
              </span>
            </div>

            {/* Expanded Disk Editor */}
            {isChangingDisk && (
              <div className="p-4 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-color)] space-y-4 animate-in fade-in duration-150">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Operating System Image
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {OS_OPTIONS.map(os => {
                      const isSel = selectedOs.id === os.id;
                      return (
                        <button
                          key={os.id}
                          type="button"
                          onClick={() => {
                            setSelectedOs(os);
                            if (bootDiskSizeGb < os.sizeGb) setBootDiskSizeGb(os.sizeGb);
                          }}
                          className={`p-2.5 text-left rounded-lg border text-xs transition-colors ${
                            isSel
                              ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-bg)] text-[var(--text-primary)]'
                              : 'border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-subtle)]'
                          }`}
                        >
                          <div className="font-semibold">{os.name}</div>
                          <div className="text-[11px] text-[var(--text-muted)] font-mono">min {os.sizeGb} GB</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      Boot Disk Type
                    </label>
                    <select
                      value={bootDiskType}
                      onChange={e => setBootDiskType(e.target.value as DiskType)}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                    >
                      <option value="pd-standard">Standard persistent disk ($0.04/GB/mo)</option>
                      <option value="pd-balanced">Balanced persistent disk ($0.10/GB/mo)</option>
                      <option value="pd-ssd">SSD persistent disk ($0.17/GB/mo)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      Size (GB, minimum {selectedOs.sizeGb} GB)
                    </label>
                    <input
                      type="number"
                      min={selectedOs.sizeGb}
                      max={1000}
                      value={bootDiskSizeGb}
                      onChange={e => setBootDiskSizeGb(Math.max(selectedOs.sizeGb, parseInt(e.target.value) || selectedOs.sizeGb))}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Firewall & Networking */}
          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 space-y-5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--accent-blue)]" />
              <span>Firewall and Networking</span>
            </h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-secondary)]">
                  By default, all incoming traffic from outside a network is blocked. Select which traffic you want to allow into this instance:
                </p>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2.5 text-xs text-[var(--text-primary)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allowHttp}
                      onChange={e => setAllowHttp(e.target.checked)}
                      className="rounded border-[var(--border-color)] bg-[var(--bg-canvas)] text-[var(--accent-blue)] focus:ring-0"
                    />
                    <span>Allow HTTP traffic (port 80)</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-[var(--text-primary)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allowHttps}
                      onChange={e => setAllowHttps(e.target.checked)}
                      className="rounded border-[var(--border-color)] bg-[var(--bg-canvas)] text-[var(--accent-blue)] focus:ring-0"
                    />
                    <span>Allow HTTPS traffic (port 443)</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Network Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={networkTags}
                    onChange={e => setNetworkTags(e.target.value)}
                    placeholder="http-server, https-server, custom-worker"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  />
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Applies firewall rules and network routes targeting these specific tags.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Service Account
                  </label>
                  <select
                    value={selectedServiceAccount}
                    onChange={e => setSelectedServiceAccount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  >
                    <option value={`${currentProject.projectNumber}-compute@developer.gserviceaccount.com`}>
                      Compute Engine default service account ({currentProject.projectNumber}-compute@developer.gserviceaccount.com)
                    </option>
                    {serviceAccounts.map(sa => (
                      <option key={sa.id} value={sa.email}>
                        {sa.displayName} ({sa.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={Boolean(nameError)}
              className="px-6 py-2.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span>Create</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('compute', 'VM instances', 'Compute Engine')}
              className="px-4 py-2.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => setShowEquivalentCode(true)}
              className="px-4 py-2.5 rounded-lg hover:bg-[var(--card-hover)] text-xs text-[var(--accent-blue)] font-medium transition-colors ml-auto flex items-center gap-1.5"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Equivalent REST / CLI</span>
            </button>
          </div>
        </form>

        {/* Live Monthly Cost Estimate Sticky Sidebar (4 cols on lg) */}
        <div className="lg:col-span-4 sticky top-6 space-y-4">
          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 space-y-5 shadow-sm">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)]">
                Monthly estimate
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-[var(--text-primary)]">
                  ${totalMonthlyCost.toFixed(2)}
                </span>
                <span className="text-xs text-[var(--text-muted)] font-mono">
                  USD
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1 font-mono">
                about ${totalHourlyCost.toFixed(4)} per hour
              </p>
            </div>

            {/* Free Tier Callout */}
            {isFreeTier && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Free tier eligible</span>
                </div>
                <p className="text-[11px] text-emerald-300/80 leading-relaxed">
                  Your first 1 e2-micro instance per month is free in US regions (us-central1, us-east1).
                </p>
              </div>
            )}

            {/* Itemized Cost Breakdown */}
            <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)] text-xs">
              <div className="font-semibold text-[var(--text-primary)]">Cost breakdown</div>

              <div className="flex justify-between items-center text-[var(--text-secondary)]">
                <span>Compute ({currentMachine.id})</span>
                <span className="font-mono text-[var(--text-primary)]">
                  ${currentMachine.monthlyPrice.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center text-[var(--text-secondary)]">
                <span>Boot disk ({bootDiskSizeGb} GB {bootDiskType})</span>
                <span className="font-mono text-[var(--text-primary)]">
                  ${diskMonthlyCost.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center text-[var(--text-secondary)]">
                <span>Egress (first 1 GB)</span>
                <span className="font-mono text-emerald-400">Free</span>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-between items-center font-semibold text-[var(--text-primary)]">
                <span>Total</span>
                <span className="font-mono text-[var(--accent-blue)]">
                  ${totalMonthlyCost.toFixed(2)} / month
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] space-y-1">
              <div className="font-medium text-[var(--text-secondary)] flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                <span>LocalCloud Emulation</span>
              </div>
              <p>
                Calculations match Google Cloud official list prices. Since this is LocalCloud, charges are deducted from your virtual credit balance!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Equivalent CLI Command Modal */}
      {showEquivalentCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-[var(--accent-blue)]" />
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                  Equivalent gcloud Command
                </h3>
              </div>
              <button
                onClick={() => setShowEquivalentCode(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs font-mono"
              >
                Close (ESC)
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)]">
              You can run this exact command inside the LocalCloud interactive Cloud Shell terminal below:
            </p>

            <div className="relative">
              <pre className="p-4 rounded-xl bg-black font-mono text-xs text-neutral-300 overflow-x-auto border border-neutral-800 leading-relaxed">
                {equivalentGcloud}
              </pre>
              <button
                onClick={copyCode}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs flex items-center gap-1 border border-neutral-700"
                title="Copy command"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Copy</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowEquivalentCode(false)}
                className="px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
