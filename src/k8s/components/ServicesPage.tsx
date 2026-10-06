/**
 * Services and ingresses page.
 *
 * The endpoint column is the interesting one: it is recomputed from the label
 * selector every render, which is what makes scaling a deployment visibly move
 * a service's backend count.
 */

import React, { useState } from 'react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Button, Card, EmptyState, Field, MetaRow, StatusBadge, inputClass } from '../../netlab/components/ui';
import { Column, DataTable, FormPanel } from '../../netlab/components/tables';
import { serviceEndpoints } from '../../sim/k8s';
import { K8sService } from '../../sim/types';

const SERVICE_TYPES: K8sService['type'][] = ['ClusterIP', 'NodePort', 'LoadBalancer'];

export const ServicesPage: React.FC = () => {
  const { state, pending, createKubernetesService, removeKubernetesService, createKubernetesIngress } = useNetLab();

  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState('');
  const [namespaceId, setNamespaceId] = useState('');
  const [selector, setSelector] = useState('');
  const [port, setPort] = useState(80);
  const [targetPort, setTargetPort] = useState(8080);
  const [type, setType] = useState<K8sService['type']>('ClusterIP');

  const [ingressOpen, setIngressOpen] = useState(false);
  const [ingressName, setIngressName] = useState('');
  const [ingressNamespace, setIngressNamespace] = useState('');
  const [host, setHost] = useState('app.example.internal');
  const [path, setPath] = useState('/');
  const [ingressService, setIngressService] = useState('');
  const [ingressPort, setIngressPort] = useState(80);

  const isPending = pending.some((p) => p.kind === 'Service');
  const effectiveNamespace = namespaceId || state.k8sNamespaces[0]?.id || '';

  const submit = async () => {
    const created = await createKubernetesService({
      name,
      namespaceId: effectiveNamespace,
      selector: parseSelector(selector),
      port,
      targetPort,
      type
    });
    if (created) {
      setName('');
      setPanelOpen(false);
    }
  };

  const submitIngress = async () => {
    const service = state.k8sServices.find((s) => s.id === ingressService);
    if (!service) return;
    const created = await createKubernetesIngress({
      name: ingressName,
      namespaceId: service.namespaceId,
      host,
      path,
      serviceId: service.id,
      servicePort: ingressPort
    });
    if (created) {
      setIngressName('');
      setIngressOpen(false);
    }
  };

  const columns: Column<K8sService>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <span className="font-mono text-[11px]">{row.type}</span>
    },
    {
      key: 'clusterIp',
      header: 'Cluster IP',
      render: (row) => <span className="font-mono text-[11px]">{row.clusterIp}</span>
    },
    {
      key: 'port',
      header: 'Port',
      numeric: true,
      render: (row) => (
        <span className="font-mono text-[11px]">
          {row.port}:{row.targetPort}
          {row.nodePort ? ` (node ${row.nodePort})` : ''}
        </span>
      )
    },
    {
      key: 'selector',
      header: 'Selector',
      render: (row) => (
        <span className="font-mono text-[11px]">
          {Object.entries(row.selector).map(([k, v]) => `${k}=${v}`).join(' ') || '-'}
        </span>
      )
    },
    {
      key: 'endpoints',
      header: 'Endpoints',
      numeric: true,
      render: (row) => {
        const count = serviceEndpoints(state, row).length;
        return <span className={count === 0 ? 'text-[var(--warning)]' : ''}>{count}</span>;
      }
    },
    {
      key: 'external',
      header: 'External address',
      render: (row) => <span className="font-mono text-[11px]">{row.externalIp ?? '-'}</span>
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'action',
      header: '',
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="danger" onClick={() => void removeKubernetesService(row.id, true)}>
            Delete
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Services</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            A service selects pods by label and gives them one stable address. Endpoints follow the selector, so they
            change when a deployment scales.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setPanelOpen((v) => !v)} disabled={state.k8sNamespaces.length === 0}>
            {panelOpen ? 'Cancel' : 'Create service'}
          </Button>
          <Button onClick={() => setIngressOpen((v) => !v)} disabled={state.k8sServices.length === 0}>
            {ingressOpen ? 'Cancel' : 'Create ingress'}
          </Button>
        </div>
      </header>

      <FormPanel open={panelOpen} title="Create a service" onClose={() => setPanelOpen(false)} footer={<div className="flex gap-2"><Button variant="secondary" onClick={() => setPanelOpen(false)}>Cancel</Button><Button onClick={() => void submit()} disabled={!name.trim() || !effectiveNamespace || !parseSelector(selector) || isPending}>Create</Button></div>}>
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="erp-api-svc" />
        </Field>
        <Field label="Namespace">
          <select className={inputClass} value={effectiveNamespace} onChange={(e) => setNamespaceId(e.target.value)}>
            {state.k8sNamespaces.map((n) => (
              <option key={n.id} value={n.id}>
                {state.k8sClusters.find((c) => c.id === n.clusterId)?.name} / {n.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Selector" hint="key=value, comma separated. Must match a deployment's labels.">
          <input className={inputClass} value={selector} onChange={(e) => setSelector(e.target.value)} placeholder="app=erp-api" />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as K8sService['type'])}>
            {SERVICE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Port">
          <input type="number" className={inputClass} value={port} onChange={(e) => setPort(Number(e.target.value))} />
        </Field>
        <Field label="Target port">
          <input type="number" className={inputClass} value={targetPort} onChange={(e) => setTargetPort(Number(e.target.value))} />
        </Field>
      </FormPanel>

      <FormPanel open={ingressOpen} title="Create an ingress" onClose={() => setIngressOpen(false)} footer={<div className="flex gap-2"><Button variant="secondary" onClick={() => setIngressOpen(false)}>Cancel</Button><Button onClick={() => void submitIngress} disabled={!ingressName.trim() || !ingressService}>Create</Button></div>}>
        <Field label="Name">
          <input className={inputClass} value={ingressName} onChange={(e) => setIngressName(e.target.value)} placeholder="erp-web-ingress" />
        </Field>
        <Field label="Service">
          <select className={inputClass} value={ingressService} onChange={(e) => {
            setIngressService(e.target.value);
            const svc = state.k8sServices.find((s) => s.id === e.target.value);
            if (svc) setIngressPort(svc.port);
          }}>
            <option value="">Select a service</option>
            {state.k8sServices.map((s) => (
              <option key={s.id} value={s.id}>
                {state.k8sNamespaces.find((n) => n.id === s.namespaceId)?.name} / {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Host">
          <input className={inputClass} value={host} onChange={(e) => setHost(e.target.value)} />
        </Field>
        <Field label="Path">
          <input className={inputClass} value={path} onChange={(e) => setPath(e.target.value)} />
        </Field>
        <Field label="Service port">
          <input type="number" className={inputClass} value={ingressPort} onChange={(e) => setIngressPort(Number(e.target.value))} />
        </Field>
      </FormPanel>

      {state.k8sClusters.length === 0 ? (
        <EmptyState title="No clusters yet" message="Services live inside a namespace, so create a cluster first." />
      ) : state.k8sServices.length === 0 ? (
        <EmptyState title="No services yet" message="Create a service above, or build the reference ERP which creates three." />
      ) : (
        <Card title={`${state.k8sServices.length} service(s)`}>
          <DataTable rows={state.k8sServices} columns={columns} emptyTitle="Nothing here yet" emptyMessage="No services." />
        </Card>
      )}

      {state.k8sIngresses.length > 0 && (
        <Card title="Ingresses">
          <div className="space-y-1.5">
            {state.k8sIngresses.map((i) => {
              const service = state.k8sServices.find((s) => s.id === i.serviceId);
              return (
                <div key={i.id} className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
                  <MetaRow label="Name" value={i.name} />
                  <MetaRow label="Host" value={<span className="font-mono text-[11px]">{i.host}</span>} />
                  <MetaRow label="Path" value={<span className="font-mono text-[11px]">{i.path}</span>} />
                  <MetaRow
                    label="Backend"
                    value={
                      <span className="font-mono text-[11px]">
                        {service ? `${service.name}:${i.servicePort}` : '(deleted)'}
                      </span>
                    }
                  />
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};

/** Turns "app=web,tier=front" into the record the engine validates. */
function parseSelector(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(',')) {
    const [key, value] = part.split('=').map((s) => s.trim());
    if (key && value) out[key] = value;
  }
  return out;
}