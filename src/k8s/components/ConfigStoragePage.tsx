/**
 * Configuration, secrets and storage page.
 *
 * Secret values are shown base64 encoded, which is what Kubernetes stores, but
 * they are never meant to be read: the page deliberately does not offer a
 * "reveal" affordance.
 */

import React, { useState } from 'react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Button, Card, EmptyState, Field, StatusBadge, inputClass } from '../../netlab/components/ui';
import { FormPanel } from '../../netlab/components/tables';

export const ConfigStoragePage: React.FC = () => {
  const { state, pending, createKubernetesConfigMap, createKubernetesSecret, createKubernetesPvc } = useNetLab();

  const [cmOpen, setCmOpen] = useState(false);
  const [cmName, setCmName] = useState('');
  const [cmNamespace, setCmNamespace] = useState('');
  const [cmData, setCmData] = useState('');

  const [secretOpen, setSecretOpen] = useState(false);
  const [secretName, setSecretName] = useState('');
  const [secretNamespace, setSecretNamespace] = useState('');
  const [secretData, setSecretData] = useState('');

  const [pvcOpen, setPvcOpen] = useState(false);
  const [pvcName, setPvcName] = useState('');
  const [pvcNamespace, setPvcNamespace] = useState('');
  const [pvcSize, setPvcSize] = useState(20);

  const isPending = pending.some((p) => p.kind === 'Volume');
  const defaultNamespace = state.k8sNamespaces[0]?.id ?? '';

  const submitConfigMap = async () => {
    const created = await createKubernetesConfigMap({
      name: cmName,
      namespaceId: cmNamespace || defaultNamespace,
      data: parsePairs(cmData)
    });
    if (created) {
      setCmName('');
      setCmData('');
      setCmOpen(false);
    }
  };

  const submitSecret = async () => {
    const created = await createKubernetesSecret({
      name: secretName,
      namespaceId: secretNamespace || defaultNamespace,
      data: parsePairs(secretData)
    });
    if (created) {
      setSecretName('');
      setSecretData('');
      setSecretOpen(false);
    }
  };

  const submitPvc = async () => {
    const created = await createKubernetesPvc({
      name: pvcName,
      namespaceId: pvcNamespace || defaultNamespace,
      storageGb: pvcSize
    });
    if (created) {
      setPvcName('');
      setPvcOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-medium text-[var(--text-primary)]">Configuration &amp; storage</h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Config maps hold plain settings, secrets hold credentials, and claims reserve disk for a workload.
        </p>
      </header>

      {state.k8sClusters.length === 0 ? (
        <EmptyState title="No clusters yet" message="These resources live inside a namespace, so create a cluster first." />
      ) : (
        <>
          <Card
            title="Config maps"
            action={
              <Button onClick={() => setCmOpen((v) => !v)}>
                {cmOpen ? 'Cancel' : 'Add config map'}
              </Button>
            }
          >
            <FormPanel open={cmOpen} title="Create a config map" onClose={() => setCmOpen(false)} footer={<div className="flex gap-2"><Button variant="secondary" onClick={() => setCmOpen(false)}>Cancel</Button><Button onClick={() => void submitConfigMap()} disabled={!cmName.trim() || Object.keys(parsePairs(cmData)).length === 0}>Create</Button></div>}>
              <Field label="Name">
                <input className={inputClass} value={cmName} onChange={(e) => setCmName(e.target.value)} placeholder="erp-config" />
              </Field>
              <Field label="Namespace">
                <select className={inputClass} value={cmNamespace || defaultNamespace} onChange={(e) => setCmNamespace(e.target.value)}>
                  {state.k8sNamespaces.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Data" hint="KEY=value, comma separated.">
                <input className={inputClass} value={cmData} onChange={(e) => setCmData(e.target.value)} placeholder="LOG_LEVEL=info,DB_HOST=erp-db-svc" />
              </Field>
            </FormPanel>

            {state.k8sConfigMaps.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No config maps.</p>
            ) : (
              <div className="space-y-2">
                {state.k8sConfigMaps.map((cm) => (
                  <div key={cm.id} className="rounded border border-[var(--border-color)] p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--text-primary)]">{cm.name}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {state.k8sNamespaces.find((n) => n.id === cm.namespaceId)?.name}
                      </span>
                    </div>
                    <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-[var(--text-secondary)]">
                      {Object.entries(cm.data).map(([k, v]) => `${k}=${v}`).join('\n')}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Secrets"
            action={
              <Button onClick={() => setSecretOpen((v) => !v)}>
                {secretOpen ? 'Cancel' : 'Add secret'}
              </Button>
            }
          >
            <FormPanel open={secretOpen} title="Create a secret" onClose={() => setSecretOpen(false)} footer={<div className="flex gap-2"><Button variant="secondary" onClick={() => setSecretOpen(false)}>Cancel</Button><Button onClick={() => void submitSecret()} disabled={!secretName.trim() || Object.keys(parsePairs(secretData)).length === 0}>Create</Button></div>}>
              <Field label="Name">
                <input className={inputClass} value={secretName} onChange={(e) => setSecretName(e.target.value)} placeholder="erp-db" />
              </Field>
              <Field label="Namespace">
                <select className={inputClass} value={secretNamespace || defaultNamespace} onChange={(e) => setSecretNamespace(e.target.value)}>
                  {state.k8sNamespaces.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Data" hint="KEY=value, comma separated. Values are stored base64 encoded.">
                <input className={inputClass} value={secretData} onChange={(e) => setSecretData(e.target.value)} placeholder="DB_USER=erp,DB_PASSWORD=secret" />
              </Field>
            </FormPanel>

            {state.k8sSecrets.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No secrets.</p>
            ) : (
              <div className="space-y-2">
                {state.k8sSecrets.map((secret) => (
                  <div key={secret.id} className="rounded border border-[var(--border-color)] p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--text-primary)]">{secret.name}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{secret.type}</span>
                    </div>
                    <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-[var(--text-secondary)]">
                      {Object.entries(secret.data).map(([k, v]) => `${k}=${v}`).join('\n')}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Persistent volume claims"
            action={
              <Button onClick={() => setPvcOpen((v) => !v)} disabled={isPending}>
                {pvcOpen ? 'Cancel' : 'Add claim'}
              </Button>
            }
          >
            <FormPanel open={pvcOpen} title="Create a claim" onClose={() => setPvcOpen(false)} footer={<div className="flex gap-2"><Button variant="secondary" onClick={() => setPvcOpen(false)}>Cancel</Button><Button onClick={() => void submitPvc()} disabled={!pvcName.trim() || isPending}>Create</Button></div>}>
              <Field label="Name">
                <input className={inputClass} value={pvcName} onChange={(e) => setPvcName(e.target.value)} placeholder="erp-db-data" />
              </Field>
              <Field label="Namespace">
                <select className={inputClass} value={pvcNamespace || defaultNamespace} onChange={(e) => setPvcNamespace(e.target.value)}>
                  {state.k8sNamespaces.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Storage (GB)">
                <input type="number" className={inputClass} value={pvcSize} min={1} onChange={(e) => setPvcSize(Number(e.target.value))} />
              </Field>
            </FormPanel>

            {state.k8sPvcs.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No claims.</p>
            ) : (
              <div className="space-y-2">
                {state.k8sPvcs.map((pvc) => (
                  <div key={pvc.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border-color)] px-2 py-1.5">
                    <div>
                      <span className="text-xs font-medium text-[var(--text-primary)]">{pvc.name}</span>
                      <span className="ml-2 text-[11px] text-[var(--text-secondary)]">
                        {pvc.storageGb} GB &middot; {pvc.accessMode}
                      </span>
                    </div>
                    <StatusBadge status={pvc.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/** Turns "A=1,B=2" into a record, ignoring blank segments. */
function parsePairs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(',')) {
    const [key, ...rest] = part.split('=');
    const value = rest.join('=').trim();
    const k = key?.trim();
    if (k && value) out[k] = value;
  }
  return out;
}