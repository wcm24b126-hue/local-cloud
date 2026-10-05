/**
 * Persistent disks page: create, attach to a running VM, detach, delete.
 */

import React, { useState } from 'react';
import { useNetLab } from '../NetLabContext';
import { Button, Field, StatusBadge, inputClass } from './ui';
import { Column, DataTable, FormPanel, formatTime } from './tables';
import { Disk } from '../../sim/types';

const DISK_TYPES = ['pd-standard', 'pd-balanced', 'pd-ssd'] as const;
const ZONES = ['us-central1-a', 'us-central1-b', 'us-east1-b', 'europe-west1-b'];

export const DisksPage: React.FC = () => {
  const { state, pending, createDiskResource, attachDiskToVm, detachDiskFromVm, removeDisk } = useNetLab();
  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState('');
  const [zone, setZone] = useState(ZONES[0]);
  const [sizeGb, setSizeGb] = useState('10');
  const [type, setType] = useState<(typeof DISK_TYPES)[number]>('pd-balanced');
  const [attachTo, setAttachTo] = useState('');

  const isPending = pending.some((p) => p.kind === 'Disk');
  const size = Number(sizeGb);

  const submit = async () => {
    const ok = await createDiskResource({ name, zone, sizeGb: size, type });
    if (ok) {
      setName('');
      setPanelOpen(false);
    }
  };

  const columns: Column<Disk>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    { key: 'zone', header: 'Zone', render: (row) => <span className="font-mono text-[11px]">{row.zone}</span> },
    { key: 'type', header: 'Type', render: (row) => <span className="font-mono text-[11px]">{row.type}</span> },
    { key: 'size', header: 'Size', numeric: true, render: (row) => `${row.sizeGb} GB` },
    { key: 'boot', header: 'Boot disk', render: (row) => (row.isBootDisk ? 'Yes' : '-') },
    {
      key: 'attached',
      header: 'Attached to',
      render: (row) =>
        row.attachedVmId ? (
          <span className="font-mono text-[11px]">{state.vms.find((v) => v.id === row.attachedVmId)?.name ?? '-'}</span>
        ) : (
          <span className="text-[var(--text-muted)]">-</span>
        ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'created', header: 'Created', render: (row) => formatTime(row.createdAt) },
    {
      key: 'action',
      header: '',
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          {row.attachedVmId ? (
            <Button size="sm" onClick={() => void detachDiskFromVm(row.id)}>
              Detach
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => void attachDiskToVm(row.id, attachTo || state.vms[0]?.id || '')}
              disabled={state.vms.length === 0 || row.isBootDisk}
              title={row.isBootDisk ? 'Boot disks cannot be detached' : undefined}
            >
              Attach
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => void removeDisk(row.id)}>
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
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Persistent disks</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Disks are storage resources. A disk can only be attached to one VM at a time, and the VM must be in the
            same zone. Boot disks cannot be detached.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className={`${inputClass} w-48`}
            value={attachTo}
            onChange={(e) => setAttachTo(e.target.value)}
            aria-label="VM to attach to"
          >
            <option value="">Attach to: first VM</option>
            {state.vms.map((v) => (
              <option key={v.id} value={v.id}>
                Attach to: {v.name}
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={() => setPanelOpen(true)}>
            Create disk
          </Button>
        </div>
      </header>

      <DataTable
        columns={columns}
        rows={state.disks}
        isPending={isPending}
        pendingLabel="Creating disk…"
        emptyTitle="No persistent disks"
        emptyMessage="Create a disk to attach extra storage to a VM instance."
      />

      <FormPanel
        open={panelOpen}
        title="Create persistent disk"
        onClose={() => setPanelOpen(false)}
        footer={
          <>
            <Button onClick={() => setPanelOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => void submit()}
              disabled={name.trim().length === 0 || !Number.isInteger(size) || size < 10}
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="disk-name">
          <input id="disk-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="data-1" />
        </Field>
        <Field label="Zone" htmlFor="disk-zone">
          <select id="disk-zone" className={inputClass} value={zone} onChange={(e) => setZone(e.target.value)}>
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Disk type" htmlFor="disk-type">
          <select id="disk-type" className={inputClass} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {DISK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Size (GB)"
          hint="Between 10 GB and 65536 GB."
          error={!Number.isInteger(size) || size < 10 ? 'Enter a whole number of at least 10.' : undefined}
          htmlFor="disk-size"
        >
          <input id="disk-size" className={inputClass} value={sizeGb} onChange={(e) => setSizeGb(e.target.value)} inputMode="numeric" />
        </Field>
      </FormPanel>
    </div>
  );
};