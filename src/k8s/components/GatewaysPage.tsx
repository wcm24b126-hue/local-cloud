/**
 * Gateways page: the edge of the system, backed by real VPC load balancers.
 *
 * A gateway here is not decoration. Creating one provisions an external or
 * internal load balancer in the lab VPC, opens a health check on the node pool
 * and reports whether traffic can actually pass.
 */

import React, { useState } from 'react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Button, Card, EmptyState, Field, MetaRow, StatusBadge, inputClass } from '../../netlab/components/ui';
import { FormPanel } from '../../netlab/components/tables';
import { gatewayIsServing, serviceEndpoints } from '../../sim/k8s';
import { healthyBackends } from '../../sim/engine';
import { K8sGateway } from '../../sim/types';

const GATEWAY_CLASSES: K8sGateway['className'][] = ['gke-l7-global-external', 'gke-l7-regional-internal-external'];

export const GatewaysPage: React.FC = () => {
  const { state, pending, createKubernetesGateway, removeKubernetesGateway } = useNetLab();

  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [port, setPort] = useState(80);
  const [className, setClassName] = useState<K8sGateway['className']>(GATEWAY_CLASSES[0]);

  const isPending = pending.some((p) => p.kind === 'Gateway');
  const effectiveService = serviceId || state.k8sServices[0]?.id || '';

  const submit = async () => {
    const created = await createKubernetesGateway({ name, namespaceId: namespaceOf(state, effectiveService), serviceId: effectiveService, port, className });
    if (created) {
      setName('');
      setPanelOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Gateways</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Each gateway provisions a load balancer in the lab VPC that fronts the cluster's nodes. Serving means the
            load balancer exists and at least one backend is healthy.
          </p>
        </div>
        <Button onClick={() => setPanelOpen((v) => !v)} disabled={state.k8sServices.length === 0}>
          {panelOpen ? 'Cancel' : 'Create gateway'}
        </Button>
      </header>

      <FormPanel open={panelOpen} title="Create a gateway" onClose={() => setPanelOpen(false)} footer={<div className="flex gap-2"><Button variant="secondary" onClick={() => setPanelOpen(false)}>Cancel</Button><Button onClick={() => void submit()} disabled={!name.trim() || !effectiveService || isPending}>Create</Button></div>}>
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="erp-external-gateway" />
        </Field>
        <Field label="Service">
          <select
            className={inputClass}
            value={effectiveService}
            onChange={(e) => {
              setServiceId(e.target.value);
              const svc = state.k8sServices.find((s) => s.id === e.target.value);
              if (svc) setPort(svc.port);
            }}
          >
            {state.k8sServices.map((s) => (
              <option key={s.id} value={s.id}>
                {state.k8sNamespaces.find((n) => n.id === s.namespaceId)?.name} / {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Listener port">
          <input type="number" className={inputClass} value={port} onChange={(e) => setPort(Number(e.target.value))} />
        </Field>
        <Field label="Gateway class">
          <select className={inputClass} value={className} onChange={(e) => setClassName(e.target.value as K8sGateway['className'])}>
            {GATEWAY_CLASSES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
      </FormPanel>

      {state.k8sClusters.length === 0 ? (
        <EmptyState title="No clusters yet" message="A gateway needs a cluster's node pool to send traffic to." />
      ) : state.k8sGateways.length === 0 ? (
        <EmptyState title="No gateways yet" message="Create one above, or build the reference ERP which publishes two." />
      ) : (
        <div className="space-y-3">
          {state.k8sGateways.map((gateway) => {
            const lb = state.loadBalancers.find((l) => l.id === gateway.lbId);
            const internalLb = state.loadBalancers.find((l) => l.id === gateway.internalLbId);
            const serving = gatewayIsServing(state, gateway);
            return (
              <Card
                key={gateway.id}
                title={gateway.name}
                action={
                  <div className="flex items-center gap-2">
                    <StatusBadge status={serving ? 'SERVING' : gateway.status} />
                    <Button size="sm" variant="danger" onClick={() => void removeKubernetesGateway(gateway.id)}>
                      Delete
                    </Button>
                  </div>
                }
              >
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
                  <MetaRow label="Address" value={<span className="font-mono text-[11px] text-[var(--accent-blue)]">{gateway.address ?? '-'}</span>} />
                  <MetaRow label="Class" value={<span className="font-mono text-[11px]">{gateway.className}</span>} />
                  <MetaRow label="Listener port" value={gateway.listenerPort} />
                  <MetaRow
                    label="Backends"
                    value={lb ? `${healthyBackends(state, lb).length}/${lb.backendVmIds.length} healthy` : '-'}
                  />
                </div>
                <div className="mt-2 space-y-1">
                  {gateway.routes.map((route) => {
                    const service = state.k8sServices.find((s) => s.id === route.serviceId);
                    return (
                      <div key={route.serviceId} className="flex flex-wrap items-center gap-x-3 text-[11px] text-[var(--text-secondary)]">
                        <span className="font-mono text-[var(--text-primary)]">{service?.name ?? '(deleted service)'}</span>
                        <span>:{route.port}</span>
                        <span>{service ? serviceEndpoints(state, service).length : 0} endpoint(s)</span>
                      </div>
                    );
                  })}
                </div>
                {internalLb && (
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                    Internal frontend <span className="font-mono text-[var(--text-secondary)]">{internalLb.frontendIp}:{internalLb.port}</span> for in-VPC clients.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** Namespace of the service a gateway fronts, so the gateway lands in the right place. */
function namespaceOf(state: ReturnType<typeof useNetLab>['state'], serviceId: string): string {
  return state.k8sServices.find((s) => s.id === serviceId)?.namespaceId ?? '';
}