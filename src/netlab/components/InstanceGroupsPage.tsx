/**
 * Managed instance groups page: instance templates, autoscaling groups, and the
 * one-click three-tier ERP reference architecture.
 *
 * A template describes a machine. A group keeps a target number of those
 * machines running, and scaling the group creates or deletes instances to match.
 */

import React, { useState } from 'react';
import { useNetLab } from '../NetLabContext';
import { Button, Field, StatusBadge, inputClass } from './ui';
import { Column, DataTable, FormPanel, formatTime } from './tables';
import { InstanceGroup, InstanceTemplate } from '../../sim/types';

const ZONES = ['us-central1-a', 'us-central1-b', 'us-central1-c'];
const MACHINE_TYPES = ['e2-micro', 'e2-small', 'e2-medium', 'n2-standard-2'];

export const InstanceGroupsPage: React.FC = () => {
  const {
    state,
    pending,
    createTemplateResource,
    removeTemplate,
    createGroupResource,
    resizeGroup,
    removeGroup,
    loadErpArchitecture,
  } = useNetLab();

  const [templateOpen, setTemplateOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplSubnet, setTplSubnet] = useState('');
  const [tplZone, setTplZone] = useState(ZONES[0]);
  const [tplType, setTplType] = useState(MACHINE_TYPES[1]);
  const [tplTags, setTplTags] = useState('');
  const [tplExternal, setTplExternal] = useState(false);

  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupTemplate, setGroupTemplate] = useState('');
  const [minSize, setMinSize] = useState('1');
  const [maxSize, setMaxSize] = useState('6');
  const [targetSize, setTargetSize] = useState('2');

  const templatePending = pending.some((p) => p.kind === 'Instance template');
  const groupPending = pending.some((p) => p.kind === 'Instance group');

  const effectiveSubnet = tplSubnet || state.subnets[0]?.id || '';
  const min = Number(minSize);
  const max = Number(maxSize);
  const target = Number(targetSize);
  const boundsValid = Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= min;

  const submitTemplate = async () => {
    const ok = await createTemplateResource({
      name: tplName,
      subnetId: effectiveSubnet,
      zone: tplZone,
      machineType: tplType,
      networkTags: tplTags.split(',').map((t) => t.trim()).filter(Boolean),
      withExternalIp: tplExternal,
    });
    if (ok) {
      setTplName('');
      setTplTags('');
      setTemplateOpen(false);
    }
  };

  const submitGroup = async () => {
    const ok = await createGroupResource({
      name: groupName,
      templateId: groupTemplate || state.instanceTemplates[0]?.id || '',
      targetSize: target,
      minSize: min,
      maxSize: max,
    });
    if (ok) {
      setGroupName('');
      setGroupOpen(false);
    }
  };

  const templateColumns: Column<InstanceTemplate>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    { key: 'machine', header: 'Machine type', render: (row) => <span className="font-mono text-[11px]">{row.machineType}</span> },
    {
      key: 'subnet',
      header: 'Subnetwork',
      render: (row) => <span className="font-mono text-[11px]">{state.subnets.find((s) => s.id === row.subnetId)?.name ?? '-'}</span>,
    },
    { key: 'zone', header: 'Zone', render: (row) => <span className="font-mono text-[11px]">{row.zone}</span> },
    { key: 'tags', header: 'Network tags', render: (row) => (row.networkTags.length ? row.networkTags.join(', ') : '-') },
    { key: 'groups', header: 'Used by', numeric: true, render: (row) => state.instanceGroups.filter((g) => g.templateId === row.id).length },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'action',
      header: '',
      render: (row) => (
        <div className="flex justify-end">
          <Button size="sm" variant="danger" onClick={() => void removeTemplate(row.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const groupColumns: Column<InstanceGroup>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'template',
      header: 'Template',
      render: (row) => <span className="font-mono text-[11px]">{state.instanceTemplates.find((t) => t.id === row.templateId)?.name ?? '-'}</span>,
    },
    { key: 'size', header: 'Instances', numeric: true, render: (row) => row.vmIds.length },
    {
      key: 'bounds',
      header: 'Autoscaling',
      render: (row) => (
        <span className="font-mono text-[11px]">
          {row.minSize} – {row.maxSize}
        </span>
      ),
    },
    {
      key: 'scale',
      header: 'Scale to',
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" disabled={row.vmIds.length <= row.minSize} onClick={() => void resizeGroup(row.id, row.vmIds.length - 1)} title={`Minimum is ${row.minSize}`}>
            −
          </Button>
          <Button size="sm" disabled={row.vmIds.length >= row.maxSize} onClick={() => void resizeGroup(row.id, row.vmIds.length + 1)} title={`Maximum is ${row.maxSize}`}>
            +
          </Button>
        </div>
      ),
    },
    {
      key: 'members',
      header: 'Members',
      render: (row) => (
        <span className="font-mono text-[11px]">
          {row.vmIds
            .map((id) => state.vms.find((v) => v.id === id)?.name)
            .filter(Boolean)
            .slice(0, 3)
            .join(', ') || '-'}
          {row.vmIds.length > 3 ? ` +${row.vmIds.length - 3}` : ''}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'created', header: 'Created', render: (row) => formatTime(row.createdAt) },
    {
      key: 'action',
      header: '',
      render: (row) => (
        <div className="flex justify-end">
          <Button size="sm" variant="danger" onClick={() => void removeGroup(row.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Instance groups</h1>
          <p className="mt-1 max-w-2xl text-xs text-[var(--text-secondary)]">
            An instance template describes a machine. A managed instance group keeps a target number of those machines
            running and creates or deletes instances when you change the target. Autoscaling bounds are the minimum and
            maximum the group will hold.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadErpArchitecture} title="Replace the lab with a complete web, app and database tier network">
            Load 3-tier ERP
          </Button>
          <Button onClick={() => setTemplateOpen(true)} disabled={state.subnets.length === 0}>
            Create template
          </Button>
          <Button variant="primary" onClick={() => setGroupOpen(true)} disabled={state.instanceTemplates.length === 0}>
            Create group
          </Button>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">Instance templates</h2>
        <DataTable
          columns={templateColumns}
          rows={state.instanceTemplates}
          isPending={templatePending}
          pendingLabel="Creating template…"
          emptyTitle="No instance templates"
          emptyMessage="A template describes the machine shape that an instance group clones."
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">Managed instance groups</h2>
        <DataTable
          columns={groupColumns}
          rows={state.instanceGroups}
          isPending={groupPending}
          pendingLabel="Creating group…"
          emptyTitle="No managed instance groups"
          emptyMessage="Create a group from a template to run and autoscale several identical instances."
        />
      </section>

      <FormPanel
        open={templateOpen}
        title="Create instance template"
        onClose={() => setTemplateOpen(false)}
        footer={
          <>
            <Button onClick={() => setTemplateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void submitTemplate()} disabled={tplName.trim().length === 0 || !effectiveSubnet}>
              Create
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="tpl-name">
          <input id="tpl-name" className={inputClass} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="web-tpl" />
        </Field>
        <Field label="Subnetwork" htmlFor="tpl-subnet">
          <select id="tpl-subnet" className={inputClass} value={effectiveSubnet} onChange={(e) => setTplSubnet(e.target.value)}>
            {state.subnets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.cidr})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Zone" htmlFor="tpl-zone">
          <select id="tpl-zone" className={inputClass} value={tplZone} onChange={(e) => setTplZone(e.target.value)}>
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Machine type" htmlFor="tpl-type">
          <select id="tpl-type" className={inputClass} value={tplType} onChange={(e) => setTplType(e.target.value)}>
            {MACHINE_TYPES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Network tags" hint="Comma separated. Used by firewall policies." htmlFor="tpl-tags">
          <input id="tpl-tags" className={inputClass} value={tplTags} onChange={(e) => setTplTags(e.target.value)} placeholder="web, http-server" />
        </Field>
        <Field label="External IP" hint="Requires an Internet Gateway on the VPC network." htmlFor="tpl-ip">
          <select id="tpl-ip" className={inputClass} value={tplExternal ? 'yes' : 'no'} onChange={(e) => setTplExternal(e.target.value === 'yes')}>
            <option value="no">No external IP</option>
            <option value="yes">Ephemeral external IP</option>
          </select>
        </Field>
      </FormPanel>

      <FormPanel
        open={groupOpen}
        title="Create managed instance group"
        onClose={() => setGroupOpen(false)}
        footer={
          <>
            <Button onClick={() => setGroupOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => void submitGroup()}
              disabled={groupName.trim().length === 0 || !boundsValid || !Number.isInteger(target)}
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="mig-name">
          <input id="mig-name" className={inputClass} value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="web-mig" />
        </Field>
        <Field label="Instance template" htmlFor="mig-template">
          <select id="mig-template" className={inputClass} value={groupTemplate || state.instanceTemplates[0]?.id || ''} onChange={(e) => setGroupTemplate(e.target.value)}>
            {state.instanceTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.machineType})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target size" hint="Instances the group should run right now." htmlFor="mig-target">
          <input id="mig-target" className={inputClass} value={targetSize} onChange={(e) => setTargetSize(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Minimum size" hint="Autoscaling floor." htmlFor="mig-min" error={!boundsValid ? 'Minimum must be between 0 and the maximum.' : undefined}>
          <input id="mig-min" className={inputClass} value={minSize} onChange={(e) => setMinSize(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Maximum size" hint="Autoscaling ceiling." htmlFor="mig-max" error={!boundsValid ? 'Maximum must be at least the minimum.' : undefined}>
          <input id="mig-max" className={inputClass} value={maxSize} onChange={(e) => setMaxSize(e.target.value)} inputMode="numeric" />
        </Field>
      </FormPanel>
    </div>
  );
};