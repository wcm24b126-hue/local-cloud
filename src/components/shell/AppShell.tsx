import React, { Suspense, lazy, useState } from 'react';
import { useLocalCloud } from '../../context/LocalCloudContext';
import { NAVIGATION_PRODUCTS } from '../../data/navigation';
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
import { CloudSqlView } from '../console/CloudSqlView';
import { KmsView } from '../console/KmsView';
import { MonitoringView } from '../console/MonitoringView';
import { SecurityView } from '../console/SecurityView';
import { ComputeOpsView } from '../console/ComputeOpsView';
import { AgentPlatformView } from '../console/AgentPlatformView';
import { MapsView } from '../console/MapsView';
import { DatabaseHubView } from '../console/DatabaseHubView';
import { NetLabProvider } from '../../netlab/NetLabContext';

// Code-split the networking lab: it is a large chunk of UI that most visits
// never open, and lazy-loading it keeps the main console bundle small.
const NetLabSection = lazy(() =>
  import('../../netlab/NetLabSection').then((m) => ({ default: m.NetLabSection }))
);

/** Product-nav paths that reuse a section id of the networking lab. */
const SECTION_ALIASES: Record<string, string> = {
  gke: 'k8s-overview',
  'gke-workloads': 'k8s-workloads',
  'gke-services': 'k8s-services',
  'gke-storage': 'k8s-config',
  'compute-disks': 'netlab-disks',
  'compute-snapshots': 'netlab-snapshots',
  'vpc-routes': 'netlab-routes',
};

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
        return <IamView key={activeView} />;
      case 'iam-resources':
        return <IamView key={activeView} initialTab="resources" />;
      case 'iam-workload':
        return <IamView key={activeView} initialTab="service-accounts" />;
      case 'apis':
      case 'apis-credentials':
      case 'apis-oauth':
      case 'apis-quotas':
        return <ApisServicesView key={activeView} />;
      case 'apis-library':
        return <ApisServicesView key={activeView} initialTab="library" />;
      case 'apis-metrics':
        return <MonitoringView key={activeView} tab="overview" />;
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
        return <VmInstancesList key={activeView} />;
      case 'compute-groups':
        return <ComputeOpsView key={activeView} tab="groups" />;
      case 'compute-templates':
        return <ComputeOpsView key={activeView} tab="templates" />;
      case 'compute-nodes':
        return <ComputeOpsView key={activeView} tab="nodes" />;
      case 'compute-operations':
        return <ComputeOpsView key={activeView} tab="operations" />;
      case 'vm-create':
        return <CreateVmInstanceView />;
      case 'vm-details':
        return <VmDetailsView />;
      case 'vpc':
      case 'vpc-networks':
      case 'vpc-subnets':
      case 'vpc-firewalls':
        return <VpcNetworkView key={activeView} />;
      case 'vpc-ips':
        return <VpcNetworkView key={activeView} initialTab="ips" />;
      case 'pubsub':
      case 'pubsub-topics':
      case 'pubsub-schemas':
      case 'pubsub-snapshots':
        return <PubSubView key={activeView} />;
      case 'pubsub-subscriptions':
        return <PubSubView key={activeView} initialTab="subscriptions" />;
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
        return <BigQueryView key={activeView} />;
      case 'bigquery-datasets':
        return <BigQueryView key={activeView} panel="datasets" />;
      case 'bigquery-scheduled':
        return <BigQueryView key={activeView} panel="scheduled" />;
      case 'bigquery-transfers':
        return <BigQueryView key={activeView} panel="transfers" />;
      case 'netlab':
      case 'netlab-overview':
      case 'netlab-guided':
      case 'netlab-vpc':
      case 'netlab-subnets':
      case 'netlab-vms':
      case 'netlab-disks':
      case 'netlab-snapshots':
      case 'netlab-instance-groups':
      case 'netlab-routes':
      case 'netlab-loadbalancers':
      case 'netlab-firewall':
      case 'netlab-tracer':
      case 'netlab-topology':
      // Disk and snapshot management lives in the lab, which owns the same
      // SimState the product nav points at, so reuse those pages instead of
      // showing VM instances under a different name.
      case 'compute-disks':
      case 'compute-snapshots':
      case 'vpc-routes':
      case 'k8s-overview':
      case 'k8s-clusters':
      case 'k8s-workloads':
      case 'k8s-services':
      case 'k8s-gateways':
      case 'k8s-config':
      // The GKE entries in the product nav are the same surface as the lab's
      // Kubernetes pages, so both spellings land on one implementation.
      case 'gke':
      case 'gke-workloads':
      case 'gke-services':
      case 'gke-storage':
        return (
          <Suspense fallback={<p className="py-6 text-sm text-[var(--text-secondary)]">Loading networking lab…</p>}>
            <NetLabSection
              requestedSection={
                activeView === 'netlab'
                  ? undefined
                  : SECTION_ALIASES[activeView] ?? activeView
              }
            />
          </Suspense>
        );
      case 'databases':
        return <DatabaseHubView key={activeView} />;
      case 'databases-migration':
        return <DatabaseHubView key={activeView} tab="migration" />;
      case 'sql':
        return <CloudSqlView key={activeView} tab="instances" />;
      case 'sql-databases':
        return <CloudSqlView key={activeView} tab="databases" />;
      case 'sql-users':
        return <CloudSqlView key={activeView} tab="users" />;
      case 'sql-backups':
        return <CloudSqlView key={activeView} tab="backups" />;
      case 'kms':
        return <KmsView key={activeView} />;
      case 'monitoring-metrics':
        return <MonitoringView key={activeView} tab="overview" />;
      case 'monitoring-alerting':
        return <MonitoringView key={activeView} tab="policies" />;
      case 'monitoring-uptime':
        return <MonitoringView key={activeView} tab="uptime" />;
      case 'security':
      case 'security-scc':
        return <SecurityView key={activeView} />;
      case 'security-scans':
        return <SecurityView key={activeView} tab="scans" />;
      case 'maps':
      case 'maps-apis':
        return <MapsView key={activeView} tab="apis" />;
      case 'maps-credentials':
        return <MapsView key={activeView} tab="credentials" />;
      case 'agent-platform':
      case 'agent-studio':
        return <AgentPlatformView key={activeView} tab="studio" />;
      case 'agent-playbooks':
        return <AgentPlatformView key={activeView} tab="playbooks" />;
      case 'agent-tools':
        return <AgentPlatformView key={activeView} tab="tools" />;
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
      default: {
        // Every path in src/data/navigation.ts is routed above. Reaching this
        // branch means navigation and the switch have drifted apart, so point
        // the user at the place that can explain or fix it.
        const product = NAVIGATION_PRODUCTS.find((p) => p.path === activeView)?.title ?? 'this page';
        return (
          <div className="max-w-2xl mx-auto py-12 px-6 text-center space-y-4">
            <div className="inline-flex p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-secondary)]">
              <span className="font-mono text-sm uppercase">Unrouted view</span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] capitalize">{product}</h1>
            <p className="text-sm text-[var(--text-secondary)] max-w-lg mx-auto">
              No console implementation is registered for <span className="font-mono">{activeView}</span>. Every entry in
              the navigation menu has one; this path is only reachable by typing it directly.
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Add a case for it in <span className="font-mono">src/components/shell/AppShell.tsx</span>.
            </p>
          </div>
        );
      }
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
