/**
 * Disk snapshots page: capture a point-in-time copy of a persistent disk and
 * restore it as a new disk.
 *
 * Snapshots are the portable copy of a disk. GCP has no live volume replication
 * between zones or regions: a regional persistent disk is the multi-zone option,
 * and a snapshot is what you keep to restore elsewhere or later.
 */

import React, { useState } from 'react';
import { useNetLab } from '../NetLabContext';
import { Button, Field, StatusBadge, inputClass } from './ui';
import { Column, DataTable, FormPanel, formatTime } from './tables';
import { DiskSnapshot } from '../../sim/types';

const STORAGE_CLASSES = ['STANDARD', 'NEARLINE', 'COLDLINE', 'ARCHIVE'] as const;

export const SnapshotsPage: React.FC = () => {
  const { state, pending, notify, createSnapshotResource, createDiskResource, removeSnapshot } = useNetLab();

  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState('');
  const [diskId, setDiskId] = useState('');
  const [storageClass, setStorageClass] = useState<(typeof STORAGE_CLASSES)[number]>('STANDARD');

  const isPending = pending.some((p) => p.kind === 'Snapshot');
  const effectiveDisk = diskId || state.disks[0]?.id || '';
  const source = state.disks.find((d) => d.id === effectiveDisk);

  const submit = async () => {
    const ok = await createSnapshotResource({ name, diskId: effectiveDisk, storageClass });
    if (ok) {
      setName('');
      setPanelOpen(false);
    }
  };

  /** Restore means "create a new disk with the snapshot's size and type". */
  const restore = async (snapshot: DiskSnapshot, diskName: string) => {
    const ok = await createDiskResource({
      name: diskName,
      sizeGb: snapshot.sizeGb,
      type: snapshot.type,
    });
    if (!ok) notify('error', `Could not restore "${snapshot.name}".`, 'Check the disk name is unique and the size is in range.');
  };

  const columns: Column<DiskSnapshot>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'source',
      header: 'Source disk',
      render: (row) => (
        <span className="font-mono text-[11px]">{state.disks.find((d) => d.id === row.sourceDiskId)?.name ?? '(deleted)'}</span>
      ),
    },
    { key: 'size', header: 'Size', numeric: true, render: (row) => `${row.sizeGb} GB` },
    { key: 'type', header: 'Disk type', render: (row) => <span className="font-mono text-[11px]">{row.type}</span> },
    { key: 'class', header: 'Storage class', render: (row) => <span className="font-mono text-[11px]">{row.storageClass}</span> },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'created', header: 'Created', render: (row) => formatTime(row.createdAt) },
    {
      key: 'action',
      header: '',
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" onClick={() => void restore(row, `${row.name}-restored`)} title="Create a new disk from this snapshot">
            Restore
          </Button>
          <Button size="sm" variant="danger" onClick={() => void removeSnapshot(row.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Disk snapshots</h1>
          <p className="mt-1 max-w-2xl text-xs text-[var(--text-secondary)]">
            A snapshot is a point-in-time copy of a persistent disk that keeps its size and type. Restoring creates a new
            disk from the snapshot. The source disk is never modified, and deleting a snapshot leaves the disk alone.
          </p>
        </div>
        <Button variant="primary" onClick={() => setPanelOpen(true)} disabled={state.disks.length === 0}>
          Create snapshot
        </Button>
      </header>

      <DataTable
        columns={columns}
        rows={state.snapshots}
        isPending={isPending}
        pendingLabel="Creating snapshot…"
        emptyTitle="No snapshots"
        emptyMessage="Snapshot a disk to keep a portable copy you can restore later."
      />

      <FormPanel
        open={panelOpen}
        title="Create snapshot"
        onClose={() => setPanelOpen(false)}
        footer={
          <>
            <Button onClick={() => setPanelOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void submit()} disabled={name.trim().length === 0 || !effectiveDisk}>
              Create
            </Button>
          </>
        }
      >
        <Field label="Snapshot name" htmlFor="snap-name">
          <input id="snap-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="data-nightly" />
        </Field>
        <Field label="Source disk" htmlFor="snap-disk">
          <select id="snap-disk" className={inputClass} value={effectiveDisk} onChange={(e) => setDiskId(e.target.value)}>
            {state.disks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.sizeGb} GB, {d.type}
                {d.attachedVmId ? ' (attached)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Storage class" hint="Cheaper classes cost less to keep but cost more to read." htmlFor="snap-class">
          <select id="snap-class" className={inputClass} value={storageClass} onChange={(e) => setStorageClass(e.target.value as typeof storageClass)}>
            {STORAGE_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        {source ? (
          <p className="text-[11px] text-[var(--text-muted)]">
            The snapshot will capture {source.sizeGb} GB of type {source.type}.
          </p>
        ) : null}
      </FormPanel>
    </div>
  );
};