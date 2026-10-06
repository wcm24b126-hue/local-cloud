import React, { useMemo, useState } from 'react';
import { Database, Plus, Trash2, Play, Square, Shield, Camera, Boxes } from 'lucide-react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Card, Button, Field, inputClass, EmptyState, MetaRow, Callout, StatusBadge } from '../../netlab/components/ui';
import { DataTable, FormPanel, formatTime, type Column } from '../../netlab/components/tables';
import { SQL_ENGINES, ENGINE_LABELS, tiersForEngine, tierShape, isAlloydb, connectionEndpoint } from '../../sim/cloudSql';
import type { SqlInstance, SqlDatabase, SqlUser, SqlBackup } from '../../sim/types';

type Tab = 'instances' | 'databases' | 'users' | 'backups';

const REGIONS = ['us-central1', 'us-east1', 'europe-west1', 'asia-south1'];

/** Cloud SQL and AlloyDB share one console; only the wording differs. */
export const CloudSqlView: React.FC<{ tab?: Tab; alloy?: boolean }> = ({ tab: initialTab, alloy = false }) => {
  const lab = useNetLab();
  const { state, pending } = lab;
  const [tab, setTab] = useState<Tab>(initialTab ?? 'instances');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [instancePanel, setInstancePanel] = useState(false);
  const [databasePanel, setDatabasePanel] = useState(false);
  const [userPanel, setUserPanel] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [engine, setEngine] = useState<SqlInstance['engine']>(alloy ? 'ALLOYDB' : 'POSTGRES_16');
  const [region, setRegion] = useState(REGIONS[0]);
  const [tier, setTier] = useState('');
  const [storageGb, setStorageGb] = useState(20);
  const [connectivity, setConnectivity] = useState<'PRIVATE' | 'PUBLIC'>('PUBLIC');
  const [vpcId, setVpcId] = useState('');
  const [deletionProtection, setDeletionProtection] = useState(false);
  const [pitr, setPitr] = useState(false);
  const [dbName, setDbName] = useState('');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState<'BUILT_IN' | 'CLOUD_IAM_SERVICE_ACCOUNT'>('BUILT_IN');

  const engines = useMemo(() => SQL_ENGINES.filter((e) => (alloy ? isAlloydb(e) : !isAlloydb(e))), [alloy]);
  const tiers = useMemo(() => tiersForEngine(engine), [engine]);

  React.useEffect(() => {
    if (!tiers.includes(tier)) setTier(tiers[0]);
  }, [tiers, tier]);

  const instances = state.sqlInstances.filter((i) => (alloy ? isAlloydb(i.engine) : !isAlloydb(i.engine)));
  const selected = instances.find((i) => i.id === selectedId) ?? instances[0];
  const shape = tierShape(tier);

  const resetInstanceForm = () => {
    setName('');
    setStorageGb(alloy ? 100 : 20);
    setVpcId('');
    setDeletionProtection(false);
    setPitr(false);
  };

  const submitInstance = async () => {
    const okResult = await lab.createSqlInstance({
      name: name.trim(),
      engine,
      region,
      tier,
      storageGb,
      connectivity,
      vpcId: connectivity === 'PRIVATE' ? vpcId : undefined,
      subnetId: undefined,
      deletionProtection,
      pointInTimeRecoveryEnabled: pitr,
    });
    if (okResult) {
      setInstancePanel(false);
      resetInstanceForm();
    }
  };

  const instanceColumns: Column<SqlInstance>[] = [
    { key: 'name', header: 'Instance ID', render: (i) => <span className="font-mono text-xs">{i.name}</span> },
    { key: 'engine', header: 'Database engine', render: (i) => ENGINE_LABELS[i.engine] },
    {
      key: 'state',
      header: 'Status',
      render: (i) => (
        <span className="flex items-center gap-1.5">
          <StatusBadge status={i.state} />
          {i.deletionProtection ? <Shield size={12} className="text-[var(--accent-blue)]" /> : null}
        </span>
      ),
    },
    { key: 'tier', header: 'Machine tier', render: (i) => <span className="font-mono text-[11px]">{i.tier}</span> },
    { key: 'storage', header: 'Storage', render: (i) => `${i.storageGb} GiB` },
    { key: 'region', header: 'Region', render: (i) => i.region },
    {
      key: 'address',
      header: 'IP address',
      render: (i) => (
        <span className="font-mono text-[11px]">{connectionEndpoint(i) ?? <span className="text-[var(--text-muted)]">stopped</span>}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (i) => (
        <div className="flex items-center justify-end gap-1">
          {i.state === 'RUNNABLE' ? (
            <Button size="sm" onClick={() => void lab.stopSqlInstance(i.id)} title="Stop instance">
              <Square size={11} /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={() => void lab.restartSqlInstance(i.id)} title="Start instance">
              <Play size={11} /> Start
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => void lab.deleteSqlInstance(i.id, true)} title="Delete">
            <Trash2 size={11} />
          </Button>
        </div>
      ),
    },
  ];

  const databases = selected ? state.sqlDatabases.filter((d) => d.instanceId === selected.id) : [];
  const databaseColumns: Column<SqlDatabase>[] = [
    { key: 'name', header: 'Database', render: (d) => <span className="font-mono text-xs">{d.name}</span> },
    { key: 'charset', header: 'Charset', render: (d) => d.charset ?? '-' },
    { key: 'collation', header: 'Collation', render: (d) => <span className="font-mono text-[11px]">{d.collation ?? '-'}</span> },
    { key: 'online', header: 'Online DDL', render: (d) => (d.onlineDdl ? 'Supported' : '-') },
    { key: 'created', header: 'Created', render: (d) => formatTime(d.createdAt) },
    {
      key: 'actions',
      header: '',
      render: (d) => (
        <Button size="sm" variant="danger" disabled={d.name === 'default'} onClick={() => void lab.deleteSqlDatabase(d.id)}>
          <Trash2 size={11} />
        </Button>
      ),
    },
  ];

  const users = selected ? state.sqlUsers.filter((u) => u.instanceId === selected.id) : [];
  const userColumns: Column<SqlUser>[] = [
    { key: 'name', header: 'User name', render: (u) => <span className="font-mono text-xs">{u.name}</span> },
    {
      key: 'type',
      header: 'Type',
      render: (u) => (u.type === 'BUILT_IN' ? 'Built-in (password)' : 'Cloud IAM service account'),
    },
    { key: 'hint', header: 'Password', render: (u) => <span className="font-mono text-[11px] text-[var(--text-muted)]">{u.passwordHint}</span> },
    { key: 'created', header: 'Created', render: (u) => formatTime(u.createdAt) },
    {
      key: 'actions',
      header: '',
      render: (u) => (
        <Button size="sm" variant="danger" onClick={() => void lab.deleteSqlUser(u.id)}>
          <Trash2 size={11} />
        </Button>
      ),
    },
  ];

  const backups = selected ? state.sqlBackups.filter((b) => b.instanceId === selected.id) : [];
  const backupColumns: Column<SqlBackup>[] = [
    { key: 'type', header: 'Type', render: (b) => (b.type === 'AUTOMATED' ? 'Automated' : 'On demand') },
    { key: 'state', header: 'Status', render: (b) => <StatusBadge status={b.state} /> },
    { key: 'size', header: 'Size', render: (b) => `${b.sizeGb} GiB` },
    { key: 'created', header: 'Created', render: (b) => formatTime(b.createdAt) },
    {
      key: 'actions',
      header: '',
      render: (b) => (
        <Button
          size="sm"
          variant="danger"
          disabled={b.type === 'AUTOMATED'}
          title={b.type === 'AUTOMATED' ? 'Automated backups expire on their own' : 'Delete backup'}
          onClick={() => void lab.deleteSqlBackup(b.id)}
        >
          <Trash2 size={11} />
        </Button>
      ),
    },
  ];

  const submitDatabase = async () => {
    if (!selected) return;
    const done = await lab.createSqlDatabase({ instanceId: selected.id, name: dbName.trim() });
    if (done) {
      setDatabasePanel(false);
      setDbName('');
    }
  };

  const submitUser = async () => {
    if (!selected) return;
    const done = await lab.createSqlUser({
      instanceId: selected.id,
      name: userName.trim(),
      password,
      type: userType,
    });
    if (done) {
      setUserPanel(false);
      setUserName('');
      setPassword('');
    }
  };

  const isPending = pending.length > 0;
  const TABS: { id: Tab; label: string }[] = [
    { id: 'instances', label: 'Instances' },
    { id: 'databases', label: 'Databases' },
    { id: 'users', label: 'Users' },
    { id: 'backups', label: 'Backups' },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-medium text-[var(--text-primary)]">
            {alloy ? <Boxes size={18} /> : <Database size={18} />}
            {alloy ? 'AlloyDB' : 'Cloud SQL'}
          </h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {alloy
              ? 'AlloyDB is PostgreSQL-compatible. Instances are called clusters and use per-optimized tiers.'
              : 'Managed relational instances. Storage, backups and access are simulated locally.'}
          </p>
        </div>
        {tab === 'instances' ? (
          <Button variant="primary" onClick={() => setInstancePanel(true)}>
            <Plus size={14} /> Create {alloy ? 'cluster' : 'instance'}
          </Button>
        ) : null}
      </header>

      <div className="flex gap-1 border-b border-[var(--border-subtle)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-xs font-medium ${
              tab === t.id
                ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'instances' ? (
        <>
          <DataTable
            columns={instanceColumns}
            rows={instances}
            emptyTitle={alloy ? 'No AlloyDB clusters yet' : 'No Cloud SQL instances yet'}
            emptyMessage={`Create an instance to get a managed ${
              alloy ? 'PostgreSQL-compatible cluster' : 'database'
            }. Private instances need a VPC network.`}
            emptyAction={
              <Button variant="primary" size="sm" onClick={() => setInstancePanel(true)}>
                <Plus size={12} /> Create
              </Button>
            }
            onRowClick={(i) => setSelectedId(i.id)}
            isPending={isPending}
            pendingLabel="Cloud SQL instance"
          />

          {selected ? (
            <Card title={selected.name}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
                <MetaRow label="Engine" value={ENGINE_LABELS[selected.engine]} />
                <MetaRow label="Machine tier" value={<span className="font-mono text-[11px]">{selected.tier}</span>} />
                <MetaRow label="vCPU / RAM" value={`${tierShape(selected.tier).cpu} / ${tierShape(selected.tier).ramMiB} MiB`} />
                <MetaRow label="Storage" value={`${selected.storageGb} GiB${selected.storageAutoResize ? ' (auto-resize on)' : ''}`} />
                <MetaRow label="Region" value={selected.region} />
                <MetaRow label="Connectivity" value={selected.connectivity === 'PRIVATE' ? 'Private IP' : 'Public IP'} />
                <MetaRow
                  label="Endpoint"
                  value={<span className="font-mono text-[11px]">{connectionEndpoint(selected) ?? 'stopped'}</span>}
                />
                <MetaRow label="PITR" value={selected.pointInTimeRecoveryEnabled ? 'Enabled' : 'Disabled'} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void lab.setSqlDeletionProtection(selected.id, !selected.deletionProtection)}>
                  <Shield size={12} />
                  {selected.deletionProtection ? 'Remove deletion protection' : 'Add deletion protection'}
                </Button>
                <Button size="sm" onClick={() => void lab.setSqlPointInTimeRecovery(selected.id, !selected.pointInTimeRecoveryEnabled)}>
                  <Camera size={12} />
                  {selected.pointInTimeRecoveryEnabled ? 'Disable point-in-time recovery' : 'Enable point-in-time recovery'}
                </Button>
                <Button size="sm" onClick={() => void lab.createSqlBackup({ instanceId: selected.id })}>
                  <Camera size={12} /> Take backup
                </Button>
                {selected.state === 'RUNNABLE' ? (
                  <Button size="sm" onClick={() => void lab.stopSqlInstance(selected.id)}>
                    <Square size={12} /> Stop
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => void lab.restartSqlInstance(selected.id)}>
                    <Play size={12} /> Start
                  </Button>
                )}
              </div>
              {selected.deletionProtection ? (
                <Callout tone="info" title="Deletion protection is on">
                  Delete is blocked until you remove it. That is the same guard the real service applies.
                </Callout>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}

      {tab !== 'instances' ? (
        <Card
          title={selected ? `On ${selected.name}` : `On ${alloy ? 'a cluster' : 'an instance'}`}
          action={
            tab === 'databases' ? (
              <Button variant="primary" size="sm" disabled={!selected} onClick={() => setDatabasePanel(true)}>
                <Plus size={12} /> Create database
              </Button>
            ) : tab === 'users' ? (
              <Button variant="primary" size="sm" disabled={!selected} onClick={() => setUserPanel(true)}>
                <Plus size={12} /> Add user
              </Button>
            ) : (
              <Button size="sm" disabled={!selected} onClick={() => selected && void lab.createSqlBackup({ instanceId: selected.id })}>
                <Camera size={12} /> Create backup
              </Button>
            )
          }
        >
          {!selected ? (
            <EmptyState title="No instance selected" message="Create an instance first; databases, users and backups all live inside one." />
          ) : tab === 'databases' ? (
            <DataTable
              columns={databaseColumns}
              rows={databases}
              emptyTitle="No databases"
              emptyMessage="The default database always exists. Create another for your data."
            />
          ) : tab === 'users' ? (
            <DataTable columns={userColumns} rows={users} emptyTitle="No users" emptyMessage="Add a built-in user with a password, or grant access to a Cloud IAM service account." />
          ) : (
            <DataTable
              columns={backupColumns}
              rows={backups}
              emptyTitle="No backups"
              emptyMessage="Take an on-demand backup, or wait for the automated one that runs daily."
              emptyAction={
                <Button size="sm" onClick={() => void lab.createSqlBackup({ instanceId: selected.id })}>
                  <Camera size={12} /> Create backup
                </Button>
              }
            />
          )}
        </Card>
      ) : null}

      <FormPanel
        open={instancePanel}
        title={`Create ${alloy ? 'cluster' : 'instance'}`}
        description="Everything is simulated. Private instances are allocated an address inside the chosen VPC."
        onClose={() => setInstancePanel(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setInstancePanel(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!name.trim() || !tier || (connectivity === 'PRIVATE' && !vpcId)}
              onClick={() => void submitInstance()}
            >
              Create
            </Button>
          </div>
        }
      >
        <Field label="Instance ID" hint="Lowercase letters, digits and hyphens.">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="erp-db" />
        </Field>
        <Field label="Database engine">
          <select className={inputClass} value={engine} onChange={(e) => setEngine(e.target.value as SqlInstance['engine'])}>
            {engines.map((e) => (
              <option key={e} value={e}>
                {ENGINE_LABELS[e]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Region">
          <select className={inputClass} value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Machine tier" hint={`${shape.cpu} vCPU, ${shape.ramMiB} MiB RAM`}>
          <select className={inputClass} value={tier} onChange={(e) => setTier(e.target.value)}>
            {tiers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Storage capacity (GiB)" hint={engine === 'ALLOYDB' ? 'AlloyDB starts at 100 GiB.' : 'Minimum 10 GiB.'}>
          <input
            type="number"
            className={inputClass}
            value={storageGb}
            min={10}
            onChange={(e) => setStorageGb(Number(e.target.value))}
          />
        </Field>
        <Field label="Connectivity">
          <select className={inputClass} value={connectivity} onChange={(e) => setConnectivity(e.target.value as 'PRIVATE' | 'PUBLIC')}>
            <option value="PUBLIC">Public IP</option>
            <option value="PRIVATE">Private IP (requires a VPC)</option>
          </select>
        </Field>
        {connectivity === 'PRIVATE' ? (
          <Field label="VPC network" hint="A public instance is reachable from anywhere, which Security Command Center flags.">
            <select className={inputClass} value={vpcId} onChange={(e) => setVpcId(e.target.value)}>
              <option value="">Select a VPC</option>
              {state.vpcs.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
          <input type="checkbox" checked={deletionProtection} onChange={(e) => setDeletionProtection(e.target.checked)} />
          Enable deletion protection
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
          <input type="checkbox" checked={pitr} onChange={(e) => setPitr(e.target.checked)} />
          Enable point-in-time recovery
        </label>
      </FormPanel>

      <FormPanel
        open={databasePanel}
        title="Create a database"
        onClose={() => setDatabasePanel(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setDatabasePanel(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!dbName.trim()} onClick={() => void submitDatabase()}>
              Create
            </Button>
          </div>
        }
      >
        <Field label="Database name">
          <input className={inputClass} value={dbName} onChange={(e) => setDbName(e.target.value)} placeholder="orders" />
        </Field>
      </FormPanel>

      <FormPanel
        open={userPanel}
        title="Add a user"
        onClose={() => setUserPanel(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setUserPanel(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!userName.trim() || (userType === 'BUILT_IN' && password.length < 8)}
              onClick={() => void submitUser()}
            >
              Create
            </Button>
          </div>
        }
      >
        <Field label="User name">
          <input className={inputClass} value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="app" />
        </Field>
        <Field label="Authentication">
          <select className={inputClass} value={userType} onChange={(e) => setUserType(e.target.value as typeof userType)}>
            <option value="BUILT_IN">Built-in (password)</option>
            <option value="CLOUD_IAM_SERVICE_ACCOUNT">Cloud IAM service account</option>
          </select>
        </Field>
        {userType === 'BUILT_IN' ? (
          <Field label="Password" hint="At least 8 characters. Only a length hint is stored, never the password itself.">
            <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        ) : (
          <Callout tone="info" title="No password needed">
            IAM principals authenticate with short-lived tokens, so there is no password to store.
          </Callout>
        )}
      </FormPanel>
    </div>
  );
};

/** AlloyDB reuses the Cloud SQL console with its own wording. */
export const AlloyDbView: React.FC<{ tab?: Tab }> = ({ tab }) => <CloudSqlView tab={tab} alloy />;

export const SqlDatabasesTab: React.FC = () => <CloudSqlView tab="databases" />;
export const SqlUsersTab: React.FC = () => <CloudSqlView tab="users" />;
export const SqlBackupsTab: React.FC = () => <CloudSqlView tab="backups" />;
