/**
 * Workloads page: namespaces, deployments, pods and autoscalers.
 *
 * Pods are not stored; they are derived from each deployment's replica count.
 * Showing them makes the replica -> endpoint relationship visible, which is the
 * part of Kubernetes that surprises people first.
 */

import React, { useState } from 'react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Button, Card, EmptyState, Field, MetaRow, StatusBadge, inputClass } from '../../netlab/components/ui';
import { Column, DataTable, FormPanel, formatTime } from '../../netlab/components/tables';
import { deploymentPods } from '../../sim/k8s';
import { K8sDeployment } from '../../sim/types';

export const WorkloadsPage: React.FC = () => {
  const {
    state,
    pending,
    createKubernetesNamespace,
    createKubernetesDeployment,
    scaleKubernetesDeployment,
    updateKubernetesImage,
    removeKubernetesDeployment,
    createKubernetesAutoscaler,
    reconcileKubernetesAutoscaler
  } = useNetLab();

  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState('');
  const [namespaceId, setNamespaceId] = useState('');
  const [replicas, setReplicas] = useState(3);
  const [image, setImage] = useState('gcr.io/localcloud/app:v1');
  const [containerPort, setContainerPort] = useState(8080);
  const [labelKey, setLabelKey] = useState('app');
  const [labelValue, setLabelValue] = useState('');
  const [imageEdit, setImageEdit] = useState<Record<string, string>>({});
  const [hpaOpen, setHpaOpen] = useState(false);
  const [hpaName, setHpaName] = useState('');
  const [hpaDeployment, setHpaDeployment] = useState('');
  const [hpaMin, setHpaMin] = useState(3);
  const [hpaMax, setHpaMax] = useState(8);
  const [hpaTarget, setHpaTarget] = useState(70);

  const isPending = pending.some((p) => p.kind === 'Workload');
  const effectiveNamespace = namespaceId || state.k8sNamespaces[0]?.id || '';

  const submit = async () => {
    const created = await createKubernetesDeployment({
      name,
      namespaceId: effectiveNamespace,
      replicas,
      image,
      containerPort,
      labels: labelValue.trim() ? { [labelKey.trim() || 'app']: labelValue.trim() } : { app: name.trim() }
    });
    if (created) {
      setName('');
      setPanelOpen(false);
    }
  };

  const submitHpa = async () => {
    const created = await createKubernetesAutoscaler({
      name: hpaName,
      namespaceId: state.k8sDeployments.find((d) => d.id === hpaDeployment)?.namespaceId ?? '',
      deploymentId: hpaDeployment,
      minReplicas: hpaMin,
      maxReplicas: hpaMax,
      targetCpuUtilization: hpaTarget
    });
    if (created) {
      setHpaName('');
      setHpaOpen(false);
    }
  };

  const columns: Column<K8sDeployment>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'namespace',
      header: 'Namespace',
      render: (row) => (
        <span className="font-mono text-[11px]">
          {state.k8sNamespaces.find((n) => n.id === row.namespaceId)?.name ?? '-'}
        </span>
      )
    },
    { key: 'image', header: 'Image', render: (row) => <span className="font-mono text-[11px]">{row.image}</span> },
    {
      key: 'replicas',
      header: 'Replicas',
      numeric: true,
      render: (row) => (
        <span>
          {row.readyReplicas}/{row.replicas}
        </span>
      )
    },
    {
      key: 'labels',
      header: 'Labels',
      render: (row) => (
        <span className="font-mono text-[11px]">
          {Object.entries(row.labels).map(([k, v]) => `${k}=${v}`).join(' ') || '-'}
        </span>
      )
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'created', header: 'Created', render: (row) => formatTime(row.createdAt) },
    {
      key: 'action',
      header: '',
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" onClick={() => void scaleKubernetesDeployment(row.id, row.replicas + 1)} title="Add a replica">
            +1
          </Button>
          <Button size="sm" onClick={() => void scaleKubernetesDeployment(row.id, Math.max(0, row.replicas - 1))} title="Remove a replica">
            -1
          </Button>
          <Button
            size="sm"
            title="Roll a new image"
            onClick={() => {
              const next = imageEdit[row.id] ?? `${row.image.split(':')[0]}:v2`;
              setImageEdit((prev) => ({ ...prev, [row.id]: next }));
              void updateKubernetesImage(row.id, next);
            }}
          >
            Roll image
          </Button>
          <Button size="sm" variant="danger" onClick={() => void removeKubernetesDeployment(row.id, true)}>
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
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Workloads</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Deployments declare how many replicas of an image to run. Pods are derived, so the replica count is the
            single number that matters.
          </p>
        </div>
        <Button onClick={() => setPanelOpen((v) => !v)} disabled={state.k8sNamespaces.length === 0}>
          {panelOpen ? 'Cancel' : 'Create deployment'}
        </Button>
      </header>

      <FormPanel open={panelOpen} title="Create a deployment" onClose={() => setPanelOpen(false)} footer={<div className="flex gap-2"><Button variant="secondary" onClick={() => setPanelOpen(false)}>Cancel</Button><Button onClick={() => void submit()} disabled={!name.trim() || !effectiveNamespace || isPending}>Deploy</Button></div>}>
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="erp-api" />
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
        <Field label="Replicas">
          <input type="number" className={inputClass} value={replicas} min={0} max={100} onChange={(e) => setReplicas(Number(e.target.value))} />
        </Field>
        <Field label="Container image">
          <input className={inputClass} value={image} onChange={(e) => setImage(e.target.value)} />
        </Field>
        <Field label="Container port">
          <input type="number" className={inputClass} value={containerPort} onChange={(e) => setContainerPort(Number(e.target.value))} />
        </Field>
        <Field label="Selector label">
          <input className={inputClass} value={labelValue} onChange={(e) => setLabelValue(e.target.value)} placeholder="erp-api" />
        </Field>
        <Field label="Selector key">
          <input className={inputClass} value={labelKey} onChange={(e) => setLabelKey(e.target.value)} />
        </Field>
      </FormPanel>

      {state.k8sClusters.length === 0 ? (
        <EmptyState title="No clusters yet" message="A workload needs a namespace, which needs a cluster. Create a cluster first." />
      ) : state.k8sDeployments.length === 0 ? (
        <EmptyState title="No workloads yet" message="Create a deployment above, or build the reference ERP from the Kubernetes overview." />
      ) : (
        <Card title={`${state.k8sDeployments.length} deployment(s)`}>
          <DataTable rows={state.k8sDeployments} columns={columns} emptyTitle="Nothing here yet" emptyMessage="No deployments." />
        </Card>
      )}

      {state.k8sDeployments.length > 0 && (
        <Card title="Pods" >
          <div className="space-y-3">
            {state.k8sDeployments.map((deployment) => {
              const pods = deploymentPods(state, deployment);
              return (
                <div key={deployment.id}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--text-primary)]">{deployment.name}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{pods.length} pod(s)</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {pods.map((pod) => (
                      <span
                        key={pod.name}
                        className="rounded border border-[var(--border-color)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]"
                      >
                        {pod.name} {pod.ip}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card
        title="Autoscalers"
        action={
          <Button onClick={() => setHpaOpen((v) => !v)} disabled={state.k8sDeployments.length === 0}>
            {hpaOpen ? 'Cancel' : 'Add autoscaler'}
          </Button>
        }
      >
        <FormPanel open={hpaOpen} title="Create an autoscaler" onClose={() => setHpaOpen(false)} footer={<div className="flex gap-2"><Button variant="secondary" onClick={() => setHpaOpen(false)}>Cancel</Button><Button onClick={() => void submitHpa()} disabled={!hpaName.trim() || !hpaDeployment}>Create</Button></div>}>
          <Field label="Name">
            <input className={inputClass} value={hpaName} onChange={(e) => setHpaName(e.target.value)} placeholder="erp-api-hpa" />
          </Field>
          <Field label="Deployment">
            <select className={inputClass} value={hpaDeployment} onChange={(e) => setHpaDeployment(e.target.value)}>
              <option value="">Select a deployment</option>
              {state.k8sDeployments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Minimum replicas">
            <input type="number" className={inputClass} value={hpaMin} onChange={(e) => setHpaMin(Number(e.target.value))} />
          </Field>
          <Field label="Maximum replicas">
            <input type="number" className={inputClass} value={hpaMax} onChange={(e) => setHpaMax(Number(e.target.value))} />
          </Field>
          <Field label="Target CPU %">
            <input type="number" className={inputClass} value={hpaTarget} onChange={(e) => setHpaTarget(Number(e.target.value))} />
          </Field>
        </FormPanel>

        {state.k8sAutoscalers.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No autoscalers. Add one, or build the reference ERP which includes three.</p>
        ) : (
          <div className="space-y-2">
            {state.k8sAutoscalers.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border-color)] px-2 py-1.5">
                <div className="min-w-0">
                  <span className="text-xs font-medium text-[var(--text-primary)]">{a.name}</span>
                  <span className="ml-2 text-[11px] text-[var(--text-secondary)]">
                    {state.k8sDeployments.find((d) => d.id === a.deploymentId)?.name} &middot; {a.minReplicas}-{a.maxReplicas} @ {a.targetCpuUtilization}% CPU
                  </span>
                </div>
                <Button size="sm" onClick={() => void reconcileKubernetesAutoscaler(a.id)} title="Evaluate once, as a metrics push would">
                  Reconcile
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Namespaces">
        <div className="flex flex-wrap gap-1.5">
          {state.k8sNamespaces.map((n) => (
            <span key={n.id} className="rounded border border-[var(--border-color)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
              {state.k8sClusters.find((c) => c.id === n.clusterId)?.name}/{n.name}
            </span>
          ))}
          {state.k8sNamespaces.length === 0 && <span className="text-[11px] text-[var(--text-muted)]">No namespaces.</span>}
        </div>
        {state.k8sClusters.length > 0 && (
          <div className="mt-2 flex items-end gap-2">
            <div className="flex-1">
              <Field label="Add a namespace">
                <input className={inputClass} placeholder="namespace name" onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const value = (e.target as HTMLInputElement).value.trim();
                  if (!value) return;
                  void createKubernetesNamespace({ name: value, clusterId: state.k8sClusters[0].id });
                  (e.target as HTMLInputElement).value = '';
                }} />
              </Field>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};