import React, { useState } from 'react';
import {
  Copy,
  Check,
  Plus,
  ArrowRight,
  ExternalLink,
  Cpu,
  ShieldCheck,
  CreditCard,
  Server,
  Archive,
  Database,
  Network,
  Layers,
  Sparkles,
  AlertTriangle,
  CloudLightning,
  Radio,
} from 'lucide-react';
import { useLocalCloud } from '../../context/LocalCloudContext';
import { LocalCloudLogo } from '../ui/IconRenderer';

interface WelcomePageProps {
  onOpenLearningTrack?: () => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({ onOpenLearningTrack }) => {
  const {
    currentProject,
    setActiveView,
    isBillingEnabledForCurrentProject,
    setIsProjectPickerOpen,
    showToast,
    linkProjectBilling,
  } = useLocalCloud();

  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showBillingWarningDialog, setShowBillingWarningDialog] = useState(false);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    showToast(`Copied ${type} to clipboard`);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCreateVmClick = () => {
    if (!isBillingEnabledForCurrentProject) {
      setShowBillingWarningDialog(true);
    } else {
      setActiveView('vm-create', 'Create VM instance', 'Compute Engine');
    }
  };

  const quickAccessTiles = [
    {
      title: 'APIs and services',
      desc: 'Enable APIs, manage credentials & quotas',
      path: 'apis',
      icon: Cpu,
      productName: 'APIs & Services',
    },
    {
      title: 'IAM and admin',
      desc: 'Permissions, roles, and service accounts',
      path: 'iam',
      icon: ShieldCheck,
      productName: 'IAM & Admin',
    },
    {
      title: 'Billing',
      desc: 'Manage billing accounts & virtual credits',
      path: 'billing',
      icon: CreditCard,
      productName: 'Billing',
    },
    {
      title: 'Compute Engine',
      desc: 'Virtual machines, disks, machine images',
      path: 'compute',
      icon: Server,
      productName: 'Compute Engine',
    },
    {
      title: 'Cloud Storage',
      desc: 'Object storage buckets and data access',
      path: 'storage',
      icon: Archive,
      productName: 'Cloud Storage',
    },
    {
      title: 'Cloud Run',
      desc: 'Deploy serverless containers & APIs',
      path: 'run',
      icon: CloudLightning,
      productName: 'Cloud Run',
    },
    {
      title: 'Pub/Sub',
      desc: 'Enterprise messaging & dead-letter queues',
      path: 'pubsub',
      icon: Radio,
      productName: 'Pub/Sub',
    },
    {
      title: 'VPC network',
      desc: 'Virtual networks, subnets, and firewalls',
      path: 'vpc',
      icon: Network,
      productName: 'VPC network',
    },
    {
      title: 'BigQuery',
      desc: 'Serverless enterprise data warehouse',
      path: 'bigquery',
      icon: Database,
      productName: 'BigQuery',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Top Hero / Welcome Banner Container */}
      <div className="relative overflow-hidden rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 sm:p-8">
        {/* Decorative Geometric Elements top-right (matching Screenshot 1) */}
        <div className="absolute top-4 right-4 pointer-events-none hidden md:block">
          <svg width="220" height="130" viewBox="0 0 220 130" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Blue dot */}
            <circle cx="170" cy="30" r="14" fill="#4285F4" fillOpacity="0.85" />
            {/* Green blob */}
            <path
              d="M130 80C140 70 165 75 160 95C155 115 130 110 120 100C110 90 120 85 130 80Z"
              fill="#34A853"
              fillOpacity="0.8"
            />
            {/* Yellow circle */}
            <circle cx="90" cy="45" r="9" fill="#FBBC05" fillOpacity="0.9" />
            {/* Red circle */}
            <circle cx="45" cy="85" r="11" fill="#EA4335" fillOpacity="0.85" />
            {/* Thin outline triangle */}
            <polygon
              points="105,95 125,125 85,125"
              stroke="#8ab4f8"
              strokeWidth="1.5"
              fill="none"
              strokeOpacity="0.7"
            />
          </svg>
        </div>

        <div className="space-y-4 max-w-2xl relative z-10">
          <div className="flex items-center gap-3">
            <LocalCloudLogo size={36} />
            <h1 className="text-2xl sm:text-3xl font-normal tracking-tight text-[var(--text-primary)]">
              Welcome
            </h1>
          </div>

          <div className="space-y-1.5 text-xs sm:text-sm text-[var(--text-secondary)]">
            <p>
              You&apos;re working in{' '}
              <button
                onClick={() => setIsProjectPickerOpen(true)}
                className="font-semibold text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1"
              >
                <span>{currentProject.name}</span>
              </button>
            </p>

            {/* Project Numbers & Copy Badges */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span>Project number:</span>
                <span className="text-[var(--text-primary)] font-semibold">{currentProject.projectNumber}</span>
                <button
                  onClick={() => handleCopy(currentProject.projectNumber, 'project number')}
                  className="p-1 hover:text-[var(--text-primary)] text-[var(--text-muted)]"
                  title="Copy project number"
                >
                  {copiedType === 'project number' ? (
                    <Check className="w-3.5 h-3.5 text-[var(--success)]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span>Project ID:</span>
                <span className="text-[var(--text-primary)] font-semibold">{currentProject.projectId}</span>
                <button
                  onClick={() => handleCopy(currentProject.projectId, 'project ID')}
                  className="p-1 hover:text-[var(--text-primary)] text-[var(--text-muted)]"
                  title="Copy project ID"
                >
                  {copiedType === 'project ID' ? (
                    <Check className="w-3.5 h-3.5 text-[var(--success)]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Quick Links */}
            <div className="flex items-center gap-4 pt-1 text-xs">
              <button
                onClick={() => setActiveView('home')}
                className="text-[var(--accent-blue)] hover:underline font-medium"
              >
                Dashboard
              </button>
              <button
                onClick={() => setIsProjectPickerOpen(true)}
                className="text-[var(--accent-blue)] hover:underline font-medium"
              >
                Cloud Hub
              </button>
            </div>
          </div>

          {/* Quick-action buttons row with + icon (Screenshot 1) */}
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={handleCreateVmClick}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs font-medium text-[var(--accent-blue)] flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create a VM</span>
            </button>

            <button
              onClick={() => setActiveView('bucket-create', 'Create bucket', 'Cloud Storage')}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs font-medium text-[var(--accent-blue)] flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create a storage bucket</span>
            </button>

            <button
              onClick={() => setActiveView('bigquery', 'SQL Workspace', 'BigQuery')}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs font-medium text-[var(--accent-blue)] flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Run a query in BigQuery</span>
            </button>

            <button
              onClick={() => setActiveView('run', 'Deploy container', 'Cloud Run')}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs font-medium text-[var(--accent-blue)] flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Deploy an application</span>
            </button>

            <button
              onClick={() => setActiveView('agent-studio', 'Create Agent', 'Agent Platform')}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs font-medium text-[var(--accent-blue)] flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create an agent</span>
            </button>

            <button
              onClick={() => setActiveView('apis-credentials', 'Create API key', 'APIs & Services')}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs font-medium text-[var(--accent-blue)] flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create API key</span>
            </button>
          </div>
        </div>

        {/* Promo Card: LocalCloud Learning Track */}
        <div className="mt-6 pt-5 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--accent-blue-bg)] border border-[var(--accent-blue-border)] text-[var(--accent-blue)]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-xs sm:text-sm text-[var(--text-primary)]">
                Join the LocalCloud learning track
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Learn GCP architecture, gcloud CLI commands, and IAM security offline with no credit card.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (onOpenLearningTrack) onOpenLearningTrack();
              else setActiveView('billing', 'Billing', 'Billing');
            }}
            className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] hover:bg-[var(--accent-hover)] text-black font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5"
          >
            <span>Explore Labs</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Access Section (Screenshot 1: 4 columns x 2 rows) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-[var(--text-primary)]">Quick access</h2>
          <button
            onClick={() => setActiveView('products', 'All Products', 'Catalog')}
            className="text-xs text-[var(--accent-blue)] hover:underline flex items-center gap-1"
          >
            <span>View all products</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickAccessTiles.map((tile, idx) => {
            const Icon = tile.icon;
            return (
              <div
                key={idx}
                onClick={() => setActiveView(tile.path, tile.title, tile.productName)}
                className="group p-4 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--card-hover)] border border-[var(--border-color)] cursor-pointer transition-all duration-150 flex flex-col justify-between h-32"
              >
                <div className="flex items-start justify-between">
                  <div className="p-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] group-hover:border-[var(--accent-blue-border)] transition-colors">
                    <Icon className="w-5 h-5 text-[var(--accent-blue)]" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-blue)] group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <h3 className="font-semibold text-xs sm:text-sm text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] transition-colors">
                    {tile.title}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                    {tile.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Educational Footer Banner */}
      <footer className="pt-4 pb-2 border-t border-[var(--border-color)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
        <div>
          <span>LocalCloud is an educational emulator. It is not affiliated with or endorsed by Google.</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setActiveView('iam')} className="hover:underline">IAM Governance</button>
          <button onClick={() => setActiveView('billing')} className="hover:underline">Virtual Quotas</button>
          <a
            href="https://cloud.google.com"
            target="_blank"
            rel="noreferrer"
            className="hover:underline inline-flex items-center gap-1"
          >
            <span>Google Cloud</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </footer>

      {/* GCP-style Billing Warning Dialog if attempting to create VM without billing */}
      {showBillingWarningDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setShowBillingWarningDialog(false)}
          />
          <div className="relative z-10 w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-amber-500/10 text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                  Billing account required
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                  In Google Cloud, Compute Engine requires an active Cloud Billing account to provision VM instances.
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-2">
                  Would you like to link your simulated <strong>My Billing Account</strong> ($300 virtual balance) to <strong>{currentProject.name}</strong> now?
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setShowBillingWarningDialog(false)}
                className="px-3 py-1.5 rounded-lg hover:bg-[var(--card-hover)] text-xs text-[var(--text-secondary)] font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  linkProjectBilling(currentProject.id, true);
                  setShowBillingWarningDialog(false);
                  setActiveView('vm-create', 'Create VM instance', 'Compute Engine');
                }}
                className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors"
              >
                Enable Billing & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
