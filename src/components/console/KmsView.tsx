import React, { useMemo, useState } from 'react';
import { KeyRound, Plus, Trash2, ShieldCheck, ShieldOff, RotateCw, Unlock, Lock } from 'lucide-react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Card, Button, Field, inputClass, EmptyState, MetaRow, Callout, StatusBadge } from '../../netlab/components/ui';
import { DataTable, FormPanel, formatTime, type Column } from '../../netlab/components/tables';
import { DESTRUCTION_WINDOW_DAYS } from '../../sim/kms';
import type { KmsKey, KmsKeyRing, KmsKeyVersion } from '../../sim/types';

const LOCATIONS = ['global', 'us-central1', 'us-east1', 'europe-west1', 'asia-south1'];

export const KmsView: React.FC = () => {
  const lab = useNetLab();
  const { state } = lab;
  const [ringPanel, setRingPanel] = useState(false);
  const [keyPanel, setKeyPanel] = useState(false);
  const [ringName, setRingName] = useState('');
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [keyName, setKeyName] = useState('');
  const [ringId, setRingId] = useState('');
  const [purpose, setPurpose] = useState<KmsKey['purpose']>('ENCRYPT_DECRYPT');
  const [protection, setProtection] = useState<KmsKey['protectionLevel']>('SOFTWARE');
  const [rotation, setRotation] = useState(0);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const rings = state.kmsKeyRings;
  const selected = state.kmsKeys.find((k) => k.id === selectedId) ?? state.kmsKeys[0];
  const selectedRing = selected ? rings.find((r) => r.id === selected.keyRingId) : undefined;
  const versions = useMemo(
    () => (selected ? state.kmsKeyVersions.filter((v) => v.keyId === selected.id) : []),
    [selected, state.kmsKeyVersions]
  );

  React.useEffect(() => {
    if (rings.length > 0 && !rings.some((r) => r.id === ringId)) setRingId(rings[0].id);
  }, [rings, ringId]);

  const submitRing = async () => {
    if (await lab.createKmsKeyRing({ name: ringName.trim(), location })) {
      setRingPanel(false);
      setRingName('');
    }
  };

  const submitKey = async () => {
    if (await lab.createKmsKey({
      keyRingId: ringId,
      name: keyName.trim(),
      purpose,
      protectionLevel: protection,
      rotationPeriodDays: rotation,
    })) {
      setKeyPanel(false);
      setKeyName('');
    }
  };

  const ringColumns: Column<KmsKeyRing>[] = [
    { key: 'name', header: 'Key ring', render: (r) => <span className="font-mono text-xs">{r.name}</span> },
    { key: 'location', header: 'Location', render: (r) => r.location },
    {
      key: 'keys',
      header: 'Keys',
      render: (r) => String(state.kmsKeys.filter((k) => k.keyRingId === r.id).length),
    },
    { key: 'created', header: 'Created', render: (r) => formatTime(r.createdAt) },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <Button size="sm" variant="danger" onClick={() => void lab.deleteKmsKeyRing(r.id, true)}>
          <Trash2 size={11} />
        </Button>
      ),
    },
  ];

  const keyColumns: Column<KmsKey>[] = [
    { key: 'name', header: 'Name', render: (k) => <span className="font-mono text-xs">{k.name}</span> },
    { key: 'purpose', header: 'Purpose', render: (k) => k.purpose },
    { key: 'algorithm', header: 'Algorithm', render: (k) => <span className="font-mono text-[11px]">{k.algorithm}</span> },
    { key: 'state', header: 'State', render: (k) => <StatusBadge status={k.state} /> },
    { key: 'protection', header: 'Protection', render: (k) => k.protectionLevel },
    {
      key: 'rotation',
      header: 'Rotation',
      render: (k) => (k.rotationPeriodDays === 0 ? 'Manual' : `Every ${k.rotationPeriodDays}d`),
    },
    {
      key: 'actions',
      header: '',
      render: (k) => (
        <div className="flex items-center justify-end gap-1">
          {k.state === 'ENABLED' ? (
            <Button size="sm" onClick={() => void lab.setKmsKeyEnabled(k.id, false)} title="Disable">
              <Lock size={11} />
            </Button>
          ) : k.state === 'DISABLED' ? (
            <Button size="sm" onClick={() => void lab.setKmsKeyEnabled(k.id, true)} title="Enable">
              <Unlock size={11} />
            </Button>
          ) : null}
          {k.state === 'PENDING_DESTRUCTION' ? (
            <Button size="sm" onClick={() => void lab.cancelKmsDestruction(k.id)} title="Cancel destruction">
              <RotateCw size={11} />
            </Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => void lab.destroyKmsKey(k.id)} title="Destroy">
              <Trash2 size={11} />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const versionColumns: Column<KmsKeyVersion>[] = [
    { key: 'id', header: 'Version', render: (v) => <span className="font-mono text-[11px]">{v.id}</span> },
    { key: 'state', header: 'State', render: (v) => <StatusBadge status={v.state} /> },
    { key: 'algorithm', header: 'Algorithm', render: (v) => <span className="font-mono text-[11px]">{v.algorithm}</span> },
    { key: 'created', header: 'Created', render: (v) => formatTime(v.createdAt) },
    {
      key: 'primary',
      header: '',
      render: (v) =>
        selected?.primaryVersionId === v.id ? (
          <span className="text-[11px] text-[var(--accent-blue)]">Primary</span>
        ) : (
          <Button size="sm" disabled={selected?.state !== 'ENABLED'} onClick={() => selected && void lab.setKmsPrimaryVersion(selected.id, v.id)}>
            Make primary
          </Button>
        ),
    },
  ];

  const pendingDestruction = selected?.destroyScheduledAt
    ? new Date(selected.destroyScheduledAt).getTime() - Date.now()
    : 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-medium text-[var(--text-primary)]">
            <KeyRound size={18} /> Cloud KMS
          </h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Key management. Keys live inside a regional key ring, and every key has numbered versions so you can roll
            encryption without losing data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setRingPanel(true)}>
            <Plus size={14} /> Create key ring
          </Button>
          <Button variant="primary" disabled={rings.length === 0} onClick={() => setKeyPanel(true)}>
            <Plus size={14} /> Create key
          </Button>
        </div>
      </header>

      <Card title="Key rings">
        <DataTable
          columns={ringColumns}
          rows={rings}
          emptyTitle="No key rings"
          emptyMessage="A key ring is the container keys live in. Create one to get started."
          emptyAction={
            <Button size="sm" onClick={() => setRingPanel(true)}>
              <Plus size={12} /> Create key ring
            </Button>
          }
          onRowClick={(r) => {
            const first = state.kmsKeys.find((k) => k.keyRingId === r.id);
            if (first) setSelectedId(first.id);
          }}
        />
      </Card>

      <Card title="Keys">
        <DataTable
          columns={keyColumns}
          rows={state.kmsKeys}
          emptyTitle="No keys"
          emptyMessage="Create a key inside a key ring. New keys start enabled with a primary version."
          emptyAction={
            <Button size="sm" disabled={rings.length === 0} onClick={() => setKeyPanel(true)}>
              <Plus size={12} /> Create key
            </Button>
          }
          onRowClick={(k) => setSelectedId(k.id)}
        />
      </Card>

      {selected ? (
        <Card
          title={`Versions of ${selected.name}`}
          action={
            <Button size="sm" disabled={selected.state !== 'ENABLED'} onClick={() => void lab.addKmsKeyVersion(selected.id)}>
              <Plus size={12} /> Add version
            </Button>
          }
        >
          <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
            <MetaRow label="Key ring" value={<span className="font-mono text-[11px]">{selectedRing?.name ?? '-'}</span>} />
            <MetaRow label="Location" value={selectedRing?.location ?? '-'} />
            <MetaRow label="State" value={<StatusBadge status={selected.state} />} />
            <MetaRow label="Protection level" value={selected.protectionLevel} />
          </div>
          {selected.state === 'PENDING_DESTRUCTION' ? (
            <Callout tone="error" title={`Destruction scheduled in ${Math.max(0, Math.ceil(pendingDestruction / 86_400_000))} days`}>
              <button className="underline" onClick={() => void lab.cancelKmsDestruction(selected.id)}>
                Cancel destruction
              </button>{' '}
              to recover the key. After {DESTRUCTION_WINDOW_DAYS} days it is gone for good.
            </Callout>
          ) : null}
          <DataTable columns={versionColumns} rows={versions} emptyTitle="No versions" emptyMessage="Add a version to roll the key." />
        </Card>
      ) : null}

      <Card title="How key lifecycle works here">
        <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
          <li className="flex gap-2">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-[var(--accent-blue)]" />
            A disabled key rejects encrypt and decrypt calls, and its primary version is disabled with it.
          </li>
          <li className="flex gap-2">
            <RotateCw size={13} className="mt-0.5 shrink-0 text-[var(--accent-blue)]" />
            Adding a version does not change what encrypts. You promote it to primary yourself, which is how a
            scheduled rotation is reviewed before it takes effect.
          </li>
          <li className="flex gap-2">
            <ShieldOff size={13} className="mt-0.5 shrink-0 text-[var(--accent-blue)]" />
            Destroy is two-phase: the key stops working immediately but can be recovered for{' '}
            {DESTRUCTION_WINDOW_DAYS} days.
          </li>
        </ul>
      </Card>

      <FormPanel
        open={ringPanel}
        title="Create a key ring"
        onClose={() => setRingPanel(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setRingPanel(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!ringName.trim()} onClick={() => void submitRing()}>
              Create
            </Button>
          </div>
        }
      >
        <Field label="Key ring ID">
          <input className={inputClass} value={ringName} onChange={(e) => setRingName(e.target.value)} placeholder="app-keys" />
        </Field>
        <Field label="Location" hint="Key ring names only have to be unique within a location.">
          <select className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)}>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </FormPanel>

      <FormPanel
        open={keyPanel}
        title="Create a crypto key"
        onClose={() => setKeyPanel(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setKeyPanel(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!keyName.trim() || !ringId} onClick={() => void submitKey()}>
              Create
            </Button>
          </div>
        }
      >
        <Field label="Key ring">
          <select className={inputClass} value={ringId} onChange={(e) => setRingId(e.target.value)}>
            {rings.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.location})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Key ID">
          <input className={inputClass} value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="app-secret" />
        </Field>
        <Field label="Purpose" hint="Only ENCRYPT_DECRYPT keys can encrypt data; the others sign or authenticate.">
          <select className={inputClass} value={purpose} onChange={(e) => setPurpose(e.target.value as KmsKey['purpose'])}>
            <option value="ENCRYPT_DECRYPT">Encrypt and decrypt</option>
            <option value="ASYMMETRIC_SIGN">Asymmetric signing</option>
            <option value="MAC">Message authentication (MAC)</option>
          </select>
        </Field>
        <Field label="Protection level">
          <select className={inputClass} value={protection} onChange={(e) => setProtection(e.target.value as KmsKey['protectionLevel'])}>
            <option value="SOFTWARE">Software</option>
            <option value="HSM">Hardware security module</option>
            <option value="EXTERNAL">External key store</option>
          </select>
        </Field>
        <Field label="Automatic rotation (days)" hint="0 disables rotation, which is the default.">
          <input type="number" min={0} className={inputClass} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />
        </Field>
      </FormPanel>
    </div>
  );
};