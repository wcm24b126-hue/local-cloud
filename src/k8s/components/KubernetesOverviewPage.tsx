/**
 * Kubernetes overview: the one-click three-tier ERP entry point.
 *
 * This page is the answer to "can I just build the whole thing?". One button
 * creates a VPC, a GKE cluster, three deployments of three replicas each, their
 * services, an ingress, two gateways with real load balancers, autoscalers,
 * configuration, a secret and a claim.
 */

import React from 'react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Button, Card, Callout, EmptyState, MetaRow, StatusBadge } from '../../netlab/components/ui';
import { formatTime } from '../../netlab/components/tables';
import { gatewayIsServing, serviceEndpoints } from '../../sim/k8s';

export const KubernetesOverviewPage: React.FC = () => {
  const { state, pending, notify, setActiveSection, loadKubernetesErp, loadTestKubernetes, clearKubernetes } = useNetLab();

  const clusters = state.k8sClusters;
  const deployments = state.k8sDeployments;
  const pods = deployments.reduce((sum, d) => sum + d.replicas, 0);
  const servingGateways = state.k8sGateways.filter((g) => gatewayIsServing(state, g)).length;
  const isPending = pending.some((p) => p.kind === 'Kubernetes cluster' || p.kind === 'Gateway');
  const isEmpty = clusters.length === 0;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-medium text-[var(--text-primary)]">Kubernetes Engine</h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Everything here is simulated locally. Clusters are backed by real VMs in the lab VPC, pods are derived from
          deployments, and gateways provision genuine load balancers.
        </p>
      </header>

      <Card
        title="Three-tier ERP on GKE"
        action={
          <div className="flex gap-2">
            <Button onClick={() => loadKubernetesErp()} disabled={isPending}>
              {isPending ? 'Building...' : 'Build ERP (3 replicas per tier)'}
            </Button>
            <Button
              variant="secondary"
              onClick={loadTestKubernetes}
              disabled={state.k8sAutoscalers.length === 0}
              title="Drive every autoscaler once, as a CPU spike would"
            >
              Run load test
            </Button>
          </div>
        }
      >
        <p className="text-xs text-[var(--text-secondary)]">
          Creates a VPC, a GKE cluster with three nodes, and three Deployments of three replicas each: web, API and
          database. Each tier gets a ClusterIP service selected by label, the web tier is published through an external
          Gateway and an Ingress, and the API tier gets an internal address. Autoscalers, a ConfigMap, a Secret and a
          PersistentVolumeClaim come with it.
        </p>
        {isEmpty ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Nothing built yet. Either use the button above, or create resources one at a time from the tabs.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
            <MetaRow label="Clusters" value={clusters.length} />
            <MetaRow label="Workloads" value={deployments.length} />
            <MetaRow label="Pods" value={pods} />
            <MetaRow label="Gateways serving" value={`${servingGateways}/${state.k8sGateways.length}`} />
          </div>
        )}
      </Card>

      {isEmpty ? (
        <EmptyState
          title="No clusters yet"
          message="Build the reference ERP above, or create a cluster by hand from the Clusters tab. A cluster needs a VPC and a subnet, so create those first if the lab is empty."
        />
      ) : (
        <Card
          title="Running clusters"
          action={
            <Button
              variant="danger"
              onClick={() => {
                clearKubernetes();
                notify('info', 'All clusters removed. The lab network was left in place.');
              }}
            >
              Remove all clusters
            </Button>
          }
        >
          <div className="space-y-3">
            {clusters.map((cluster) => {
              const clusterDeployments = state.k8sDeployments.filter((d) => d.clusterId === cluster.id);
              const clusterGateways = state.k8sGateways.filter((g) => g.clusterId === cluster.id);
              return (
                <div key={cluster.id} className="rounded-lg border border-[var(--border-color)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{cluster.name}</span>
                      <StatusBadge status={cluster.status} />
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => setActiveSection('k8s-workloads')}>
                        Workloads
                      </Button>
                      <Button size="sm" onClick={() => setActiveSection('k8s-services')}>
                        Services
                      </Button>
                      <Button size="sm" onClick={() => setActiveSection('k8s-gateways')}>
                        Gateways
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
                    <MetaRow label="Nodes" value={`${cluster.vmIds.length}`} />
                    <MetaRow label="Version" value={<span className="font-mono text-[11px]">{cluster.version}</span>} />
                    <MetaRow label="Machine type" value={<span className="font-mono text-[11px]">{cluster.machineType}</span>} />
                    <MetaRow label="Created" value={formatTime(cluster.createdAt)} />
                  </div>
                  <div className="mt-2 space-y-1">
                    {clusterDeployments.map((d) => {
                      const service = state.k8sServices.find(
                        (s) =>
                          s.clusterId === cluster.id &&
                          s.namespaceId === d.namespaceId &&
                          Object.entries(s.selector).every(([k, v]) => d.labels[k] === v)
                      );
                      const endpoints = service ? serviceEndpoints(state, service).length : 0;
                      return (
                        <div key={d.id} className="flex flex-wrap items-center gap-x-3 text-[11px] text-[var(--text-secondary)]">
                          <span className="font-mono text-[var(--text-primary)]">{d.name}</span>
                          <span>
                            {d.readyReplicas}/{d.replicas} ready
                          </span>
                          <span>{endpoints} endpoint(s)</span>
                          <span className="font-mono text-[var(--text-muted)]">{d.image}</span>
                        </div>
                      );
                    })}
                    {clusterGateways.map((g) => (
                      <div key={g.id} className="flex flex-wrap items-center gap-x-3 text-[11px] text-[var(--text-secondary)]">
                        <span className="font-mono text-[var(--text-primary)]">{g.name}</span>
                        <span className="font-mono text-[var(--accent-blue)]">{g.address ?? 'provisioning'}</span>
                        <span>{gatewayIsServing(state, g) ? 'serving' : 'not serving'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Callout tone="info" title="How this differs from the VM lab">
        The VM reference architecture wires machines together with instance groups and load balancers. This one deploys
        Kubernetes objects instead: services select pods by label, so scaling a tier automatically widens its endpoint
        set, and a gateway's address disappears when its load balancer does.
      </Callout>
    </div>
  );
};