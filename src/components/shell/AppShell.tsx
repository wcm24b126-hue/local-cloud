import React, { Suspense, lazy, useState } from 'react';
import { useLocalCloud } from '../../context/LocalCloudContext';
import { TopBar } from './TopBar';
import { NavDrawer } from './NavDrawer';
import { ProjectSelectorModal } from './ProjectSelectorModal';
import { CommandPalette } from './CommandPalette';
import { CloudShellDrawer } from './CloudShellDrawer';
import { AssistantDrawer } from './AssistantDrawer';
import { WelcomePage } from '../console/WelcomePage';
import { BillingView } from '../console/BillingView';
import { IamView } from '../console/IamView';
import { ApisServicesView } from '../console/ApisServicesView';
import { ProductsCatalogView } from '../console/ProductsCatalogView';
import { LearningTrackModal } from '../console/LearningTrackModal';
import { StorageBucketsList } from '../console/storage/StorageBucketsList';
import { CreateBucketView } from '../console/storage/CreateBucketView';
import { BucketDetailsView } from '../console/storage/BucketDetailsView';
import { VmInstancesList } from '../console/compute/VmInstancesList';
import { CreateVmInstanceView } from '../console/compute/CreateVmInstanceView';
import { VmDetailsView } from '../console/compute/VmDetailsView';
import { VpcNetworkView } from '../console/compute/VpcNetworkView';
import { PubSubView } from '../console/pubsub/PubSubView';
import { CloudRunView } from '../console/run/CloudRunView';
import { SecretManagerView } from '../console/secrets/SecretManagerView';
import { BigQueryView } from '../console/bigquery/BigQueryView';
import { LogsExplorerView } from '../console/logging/LogsExplorerView';
import { NetLabProvider } from '../../netlab/NetLabContext';

// Code-split the networking lab: it is a large chunk of UI that most visits
// never open, and lazy-loading it keeps the main console bundle small.
const NetLabSection = lazy(() =>
  import('../../netlab/NetLabSection').then((m) => ({ default: m.NetLabSection }))
);

export const AppShell: React.FC = () => {
  const {
    activeView,
    toastMessage,
    setIsCommandPaletteOpen,
    isCloudShellOpen,
    setIsCloudShellOpen,
    setIsNavDrawerOpen,
    setIsAssistantOpen,
    setIsProjectPickerOpen,
  } = useLocalCloud();
  const [isLearningTrackOpen, setIsLearningTrackOpen] = useState(false);

  // Global Keyboard Shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA';

      if (e.key === 'Escape') {
        setIsNavDrawerOpen(false);
        setIsAssistantOpen(false);
        setIsCommandPaletteOpen(false);
        setIsProjectPickerOpen(false);
        setIsLearningTrackOpen(false);
        return;
      }

      if (isInput) return;

      if (e.key === '/') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setIsCloudShellOpen(!isCloudShellOpen);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        setIsLearningTrackOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCloudShellOpen,
    setIsCloudShellOpen,
    setIsCommandPaletteOpen,
    setIsNavDrawerOpen,
    setIsAssistantOpen,
    setIsProjectPickerOpen,
  ]);

  // Render active view inside page canvas
  const renderActiveView = () => {
    switch (activeView) {
      case 'home':
        return <WelcomePage onOpenLearningTrack={() => setIsLearningTrackOpen(true)} />;
      case 'billing':
      case 'billing-budgets':
      case 'billing-reports':
      case 'billing-payment':
      case 'billing-projects':
      case 'billing-export':
        return <BillingView />;
      case 'iam':
      case 'iam-roles':
      case 'iam-service-accounts':
      case 'iam-audit':
      case 'iam-policies':
        return <IamView />;
      case 'apis':
      case 'apis-library':
      case 'apis-credentials':
      case 'apis-oauth':
      case 'apis-quotas':
        return <ApisServicesView />;
      case 'storage':
      case 'storage-settings':
      case 'storage-monitoring':
      case 'storage-transfer':
        return <StorageBucketsList />;
      case 'bucket-create':
        return <CreateBucketView />;
      case 'bucket-details':
        return <BucketDetailsView />;
      case 'compute':
      case 'compute-vms':
      case 'compute-images':
      case 'compute-disks':
      case 'compute-snapshots':
        return <VmInstancesList />;
      case 'vm-create':
        return <CreateVmInstanceView />;
      case 'vm-details':
        return <VmDetailsView />;
      case 'vpc':
      case 'vpc-networks':
      case 'vpc-subnets':
      case 'vpc-firewalls':
      case 'vpc-routes':
        return <VpcNetworkView />;
      case 'pubsub':
      case 'pubsub-topics':
      case 'pubsub-subscriptions':
      case 'pubsub-schemas':
      case 'pubsub-snapshots':
        return <PubSubView />;
      case 'run':
      case 'run-jobs':
      case 'run-domains':
        return <CloudRunView />;
      case 'secrets':
      case 'secret-manager':
        return <SecretManagerView />;
      case 'bigquery':
      case 'bigquery-studio':
      case 'bigquery-sql':
        return <BigQueryView />;
      case 'netlab':
      case 'netlab-overview':
      case 'netlab-guided':
      case 'netlab-vpc':
      case 'netlab-subnets':
      case 'netlab-vms':
      case 'netlab-disks':
      case 'netlab-routes':
      case 'netlab-loadbalancers':
      case 'netlab-firewall':
      case 'netlab-tracer':
      case 'netlab-topology':
        return (
          <Suspense fallback={<p className="py-6 text-sm text-[var(--text-secondary)]">Loading networking lab…</p>}>
            <NetLabSection requestedSection={activeView === 'netlab' ? undefined : activeView} />
          </Suspense>
        );
      case 'logging':
      case 'logging-explorer':
      case 'logging-sinks':
      case 'monitoring':
      case 'monitoring-dashboards':
        return <LogsExplorerView />;
      case 'products':
      case 'marketplace':
      case 'marketplace-vm':
      case 'marketplace-containers':
        return <ProductsCatalogView />;
      default:
        // Default / stub view for un-implemented future phases (Storage, Compute, BigQuery)
        // With educational placeholder that links to Phase 2/3!
        return (
          <div className="max-w-4xl mx-auto py-12 px-6 text-center space-y-4">
            <div className="inline-flex p-3 rounded-2xl bg-[var(--accent-blue-bg)] border border-[var(--accent-blue-border)] text-[var(--accent-blue)]">
              <span className="font-mono text-sm uppercase">Phase 1 Emulation</span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] capitalize">
              {activeView.replace('-', ' ')}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] max-w-lg mx-auto">
              You are navigating in LocalCloud. This service interface is part of subsequent phases (Phase 2: Cloud Storage, Phase 3: Compute Engine &amp; VPC).
            </p>
            <div className="pt-4 flex justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] hover:bg-[var(--card-hover)]"
              >
                Reload Console
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <NetLabProvider>
    <div className="min-h-screen bg-[var(--bg-shell)] flex flex-col font-sans transition-colors duration-150">
      {/* Top Bar */}
      <TopBar />

      {/* Nav Drawer */}
      <NavDrawer />

      {/* Modals & Dialogs */}
      <ProjectSelectorModal />
      <CommandPalette />
      <LearningTrackModal
        isOpen={isLearningTrackOpen}
        onClose={() => setIsLearningTrackOpen(false)}
      />

      {/* Main Page Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Inset Canvas matching Screenshot 1 */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 pb-20">
          <div className="min-h-full rounded-2xl sm:rounded-3xl bg-[var(--bg-canvas)] border border-[var(--border-color)] p-4 sm:p-6 shadow-sm">
            {renderActiveView()}
          </div>
        </main>

        {/* Gemini-style Assistant Drawer */}
        <AssistantDrawer />
      </div>

      {/* Cloud Shell Terminal docked at bottom */}
      <CloudShellDrawer />

      {/* Toast notification overlay */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-neutral-900 text-white border border-neutral-700 shadow-2xl text-xs font-medium animate-in fade-in slide-in-from-bottom-2 duration-150 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-blue)] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
    </NetLabProvider>
  );
};
