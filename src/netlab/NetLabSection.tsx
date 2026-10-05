/**
 * NetLab shell: renders the lab section picker, the active page, and the toast
 * stack. Mounted inside the existing app shell so navigation, theme, and the
 * fake Cloud Shell all keep working.
 */

import React, { useEffect, useMemo } from 'react';
import { useNetLab } from './NetLabContext';
import { isLabEnabled } from '../sim/mode';
import { NetLabOverviewPage } from './components/NetLabOverviewPage';
import { VpcNetworksPage } from './components/VpcNetworksPage';
import { SubnetsPage } from './components/SubnetsPage';
import { VmInstancesPage } from './components/VmInstancesPage';
import { DisksPage } from './components/DisksPage';
import { RoutesPage } from './components/RoutesPage';
import { LoadBalancerPage } from './components/LoadBalancerPage';
import { FirewallPoliciesPage } from './components/FirewallPoliciesPage';
import { PacketTracerPage } from './components/PacketTracerPage';
import { GuidedLabPage } from './components/GuidedLabPage';
import { TopologyGraph } from './components/TopologyGraph';
import { Card } from './components/ui';

interface Section {
  id: string;
  label: string;
  render: () => React.ReactElement;
}

const SECTIONS: Section[] = [
  { id: 'netlab-overview', label: 'Overview', render: () => <NetLabOverviewPage /> },
  { id: 'netlab-guided', label: 'Guided lab', render: () => <GuidedLabPage /> },
  { id: 'netlab-vpc', label: 'VPC networks', render: () => <VpcNetworksPage /> },
  { id: 'netlab-subnets', label: 'Subnetworks', render: () => <SubnetsPage /> },
  { id: 'netlab-vms', label: 'VM instances', render: () => <VmInstancesPage /> },
  { id: 'netlab-disks', label: 'Persistent disks', render: () => <DisksPage /> },
  { id: 'netlab-routes', label: 'Routes', render: () => <RoutesPage /> },
  { id: 'netlab-loadbalancers', label: 'Load balancing', render: () => <LoadBalancerPage /> },
  { id: 'netlab-firewall', label: 'Firewall policies', render: () => <FirewallPoliciesPage /> },
  { id: 'netlab-tracer', label: 'Packet tracer', render: () => <PacketTracerPage /> },
  { id: 'netlab-topology', label: 'Topology', render: () => <TopologyOnlyPage /> },
];

const TopologyOnlyPage: React.FC = () => (
  <div className="space-y-4">
    <header>
      <h1 className="text-xl font-medium text-[var(--text-primary)]">Network topology</h1>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        Dashed rectangles are subnetworks, dashed blue rings are firewall policy targets, and node colour encodes
        resource type.
      </p>
    </header>
    <Card title="Topology">
      <TopologyGraph />
    </Card>
  </div>
);

const ToastStack: React.FC = () => {
  const { toasts, dismissToast } = useNetLab();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => {
        const tone =
          toast.kind === 'error'
            ? 'border-[var(--danger)]/50 bg-[var(--bg-surface)]'
            : toast.kind === 'success'
              ? 'border-[var(--success)]/50 bg-[var(--bg-surface)]'
              : 'border-[var(--accent-blue-border)] bg-[var(--bg-surface)]';
        const label = toast.kind === 'error' ? 'Error' : toast.kind === 'success' ? 'Done' : 'Info';
        const labelColor =
          toast.kind === 'error' ? 'text-[var(--danger)]' : toast.kind === 'success' ? 'text-[var(--success)]' : 'text-[var(--accent-blue)]';

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-lg border px-3 py-2.5 shadow-lg ${tone}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className={`text-xs font-medium ${labelColor}`}>{label}</p>
                <p className="text-xs text-[var(--text-primary)]">{toast.message}</p>
                {toast.detail ? <p className="text-[11px] text-[var(--text-secondary)]">{toast.detail}</p> : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismissToast(toast.id)}
                className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const NetLabSection: React.FC<{ requestedSection?: string }> = ({ requestedSection }) => {
  const { activeSection, setActiveSection, isLoading } = useNetLab();
  const labEnabled = isLabEnabled();

  const sections = useMemo(
    () => (labEnabled ? SECTIONS : SECTIONS.filter((s) => s.id !== 'netlab-guided')),
    [labEnabled]
  );

  // External navigation (the console drawer) opens a specific lab page; the
  // context keeps its own section state, so mirror the request across.
  useEffect(() => {
    if (!requestedSection) return;
    if (sections.some((s) => s.id === requestedSection) && requestedSection !== activeSection) {
      setActiveSection(requestedSection);
    }
  }, [requestedSection, sections, activeSection, setActiveSection]);

  const section = sections.find((s) => s.id === activeSection) ?? sections[0];

  return (
    <div className="flex h-full flex-col">
      <nav aria-label="Networking lab sections" className="shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-shell)]">
        <ul className="flex gap-1 overflow-x-auto px-3 py-2">
          {sections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setActiveSection(s.id)}
                aria-current={s.id === section.id ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors ${
                  s.id === section.id
                    ? 'bg-[var(--accent-blue-bg)] text-[var(--accent-blue)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--card-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {isLoading ? (
          <p className="text-xs text-[var(--text-secondary)]">Loading saved lab…</p>
        ) : (
          section.render()
        )}
      </div>

      <ToastStack />
    </div>
  );
};

/** Section id used by the app shell navigation to open the lab. */
export const NETLAB_SECTION = 'netlab-overview';