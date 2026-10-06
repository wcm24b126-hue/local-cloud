import { describe, it, expect } from 'vitest';
import { createInitialState } from './engine';
import {
  createSqlInstance,
  createSqlDatabase,
  createSqlUser,
  createBackup,
  deleteBackup,
  deleteSqlInstance,
  deleteSqlDatabase,
  stopSqlInstance,
  restartSqlInstance,
  setDeletionProtection,
  setPointInTimeRecovery,
  tiersForEngine,
  isAlloydb,
  connectionEndpoint,
  databasesOf,
  usersOf,
  backupsOf,
  SQL_ENGINES,
} from './cloudSql';
import { createVpc, createSubnet, createVm } from './engine';
import type { SimResult } from './types';

/** Read a result's error code and guidance without narrowing every call site. */
const codeOf = (result: SimResult<unknown>): string => (result.ok ? 'OK' : result.code);
const fixOf = (result: SimResult<unknown>): string => (result.ok ? '' : result.howToFix);

function lab() {
  let state = createInitialState();
  const vpc = createVpc(state, { name: 'sql-net' });
  if (!vpc.ok) throw new Error(vpc.message);
  state = vpc.value.state;
  const subnet = createSubnet(state, {
    name: 'sql-subnet',
    vpcId: vpc.value.vpc.id,
    cidr: '10.10.1.0/24',
    region: 'us-central1',
  });
  if (!subnet.ok) throw new Error(subnet.message);
  return subnet.value.state;
}

const base = {
  name: 'erp-db',
  engine: 'POSTGRES_14' as const,
  region: 'us-central1',
  tier: 'db-custom-2-7680',
  connectivity: 'PUBLIC' as const,
};

describe('Cloud SQL instance lifecycle', () => {
  it('creates a public instance with an endpoint', () => {
    const result = createSqlInstance(createInitialState(), base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.instance.state).toBe('RUNNABLE');
    expect(result.value.instance.publicIp).toBeDefined();
    expect(result.value.instance.privateIp).toBeUndefined();
    expect(connectionEndpoint(result.value.instance)).toBe(result.value.instance.publicIp);
  });

  it('seeds the default database, as the real service does', () => {
    const result = createSqlInstance(createInitialState(), base);
    if (!result.ok) throw new Error('expected ok');
    expect(databasesOf(result.value.state, result.value.instance.id).map((d) => d.name)).toEqual(['default']);
  });

  it('rejects duplicate instance names', () => {
    const first = createSqlInstance(createInitialState(), base);
    if (!first.ok) throw new Error('expected ok');
    const second = createSqlInstance(first.value.state, base);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(codeOf(second)).toBe('DUPLICATE_NAME');
  });

  it('requires a VPC for private connectivity', () => {
    const result = createSqlInstance(createInitialState(), { ...base, connectivity: 'PRIVATE' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(codeOf(result)).toBe('DEPENDENCY');
    expect(fixOf(result)).toMatch(/VPC/);
  });

  it('allocates a private IP when a VPC is present', () => {
    const state = lab();
    const result = createSqlInstance(state, {
      ...base,
      connectivity: 'PRIVATE',
      vpcId: state.vpcs[0].id,
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.instance.privateIp).toMatch(/^10\./);
    expect(result.value.instance.publicIp).toBeUndefined();
    expect(connectionEndpoint(result.value.instance)).toBe(result.value.instance.privateIp);
  });

  it('gives each private instance a distinct address', () => {
    const state = lab();
    const vpcId = state.vpcs[0].id;
    const a = createSqlInstance(state, { ...base, name: 'db-a', connectivity: 'PRIVATE', vpcId });
    if (!a.ok) throw new Error(a.message);
    const b = createSqlInstance(a.value.state, { ...base, name: 'db-b', connectivity: 'PRIVATE', vpcId });
    if (!b.ok) throw new Error(b.message);
    expect(a.value.instance.privateIp).not.toBe(b.value.instance.privateIp);
  });

  it('separates Cloud SQL tiers from AlloyDB tiers', () => {
    expect(tiersForEngine('ALLOYDB').every((t) => t.startsWith('db-perf-optimized'))).toBe(true);
    expect(tiersForEngine('POSTGRES_16').some((t) => t.startsWith('db-perf-optimized'))).toBe(false);
  });

  it('rejects an AlloyDB tier on a Cloud SQL engine and vice versa', () => {
    const state = createInitialState();
    const wrong1 = createSqlInstance(state, { ...base, tier: 'db-perf-optimized-N' });
    expect(wrong1.ok).toBe(false);
    const wrong2 = createSqlInstance(state, { ...base, engine: 'ALLOYDB' });
    expect(wrong2.ok).toBe(false);
  });

  it('defaults AlloyDB storage to 100 GiB and Cloud SQL to 20 GiB', () => {
    const state = createInitialState();
    const alloy = createSqlInstance(state, { ...base, engine: 'ALLOYDB', tier: 'db-perf-optimized-N' });
    if (!alloy.ok) throw new Error(alloy.message);
    expect(alloy.value.instance.storageGb).toBe(100);
    const sql = createSqlInstance(state, base);
    if (!sql.ok) throw new Error(sql.message);
    expect(sql.value.instance.storageGb).toBe(20);
  });

  it('marks AlloyDB databases as online-DDL capable', () => {
    const state = createInitialState();
    const created = createSqlInstance(state, { ...base, engine: 'ALLOYDB', tier: 'db-perf-optimized-N' });
    if (!created.ok) throw new Error(created.message);
    const db = createSqlDatabase(created.value.state, {
      instanceId: created.value.instance.id,
      name: 'sales',
    });
    if (!db.ok) throw new Error(db.message);
    expect(db.value.database.onlineDdl).toBe(true);
    expect(isAlloydb(created.value.instance.engine)).toBe(true);
  });

  it('exposes every advertised engine', () => {
    expect(SQL_ENGINES).toContain('ALLOYDB');
    expect(SQL_ENGINES).toContain('POSTGRES_16');
    expect(SQL_ENGINES).toContain('MYSQL_8_0');
  });
});

describe('Cloud SQL databases and users', () => {
  function withInstance() {
    const created = createSqlInstance(createInitialState(), base);
    if (!created.ok) throw new Error(created.message);
    return created.value;
  }

  it('adds a database to a running instance', () => {
    const { state, instance } = withInstance();
    const result = createSqlDatabase(state, { instanceId: instance.id, name: 'orders' });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.database.instanceId).toBe(instance.id);
  });

  it('rejects a duplicate database name on the same instance', () => {
    const { state, instance } = withInstance();
    const first = createSqlDatabase(state, { instanceId: instance.id, name: 'orders' });
    if (!first.ok) throw new Error(first.message);
    const second = createSqlDatabase(first.value.state, { instanceId: instance.id, name: 'orders' });
    expect(codeOf(second)).toBe('DUPLICATE_NAME');
  });

  it('allows the same database name on a different instance', () => {
    const first = withInstance();
    const second = createSqlInstance(first.state, { ...base, name: 'db-two' });
    if (!second.ok) throw new Error(second.message);
    createSqlDatabase(first.state, { instanceId: first.instance.id, name: 'orders' });
    const other = createSqlDatabase(second.value.state, {
      instanceId: second.value.instance.id,
      name: 'orders',
    });
    expect(other.ok).toBe(true);
  });

  it('blocks reserved SQL Server database names', () => {
    const created = createSqlInstance(createInitialState(), {
      ...base,
      engine: 'SQLSERVER_2022_STANDARD',
    });
    if (!created.ok) throw new Error(created.message);
    const result = createSqlDatabase(created.value.state, {
      instanceId: created.value.instance.id,
      name: 'master',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(fixOf(result)).toMatch(/master/);
  });

  it('keeps every user when a database is deleted', () => {
    const { state, instance } = withInstance();
    // Users are instance-scoped, so dropping a database must not touch them.
    const withDb = createSqlDatabase(state, { instanceId: instance.id, name: 'appdb' });
    if (!withDb.ok) throw new Error(withDb.message);
    const withUser = createSqlUser(withDb.value.state, {
      instanceId: instance.id,
      name: 'appuser',
      password: 'sufficiently-long',
    });
    if (!withUser.ok) throw new Error(withUser.message);
    const before = withUser.value.state.sqlUsers.map((u) => `${u.instanceId}/${u.name}`);

    const removed = deleteSqlDatabase(withUser.value.state, withDb.value.database.id);
    if (!removed.ok) throw new Error(removed.message);
    expect(databasesOf(removed.value.state, instance.id).some((d) => d.name === 'appdb')).toBe(false);
    expect(removed.value.state.sqlUsers.map((u) => `${u.instanceId}/${u.name}`)).toEqual(before);
  });

  it('does not delete unrelated instances\' users', () => {
    const { state, instance } = withInstance();
    const other = createSqlInstance(state, {
      name: 'other-instance',
      engine: 'POSTGRES_16',
      tier: 'db-custom-2-7680',
      region: 'us-central1',
      connectivity: 'PUBLIC',
    });
    if (!other.ok) throw new Error(other.message);
    const otherUser = createSqlUser(other.value.state, {
      instanceId: other.value.instance.id,
      name: 'appdb',
      password: 'sufficiently-long',
    });
    if (!otherUser.ok) throw new Error(otherUser.message);
    const withDb = createSqlDatabase(otherUser.value.state, { instanceId: other.value.instance.id, name: 'appdb' });
    if (!withDb.ok) throw new Error(withDb.message);

    const removed = deleteSqlDatabase(withDb.value.state, withDb.value.database.id);
    if (!removed.ok) throw new Error(removed.message);
    expect(usersOf(removed.value.state, other.value.instance.id).map((u) => u.name)).toContain('appdb');
    expect(databasesOf(removed.value.state, other.value.instance.id).map((d) => d.name)).not.toContain('appdb');
  });

  it('refuses to delete the default database', () => {
    const { state, instance } = withInstance();
    const def = databasesOf(state, instance.id).find((d) => d.name === 'default')!;
    const result = deleteSqlDatabase(state, def.id);
    expect(codeOf(result)).toBe('INVALID_STATE');
  });

  it('requires a long enough password for built-in users', () => {
    const { state, instance } = withInstance();
    const result = createSqlUser(state, { instanceId: instance.id, name: 'app', password: 'short' });
    expect(result.ok).toBe(false);
  });

  it('never stores the password itself', () => {
    const { state, instance } = withInstance();
    const result = createSqlUser(state, {
      instanceId: instance.id,
      name: 'app',
      password: 'super-secret-password',
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.user.passwordHint).toBe('21 characters');
    expect(JSON.stringify(result.value.state)).not.toContain('super-secret-password');
  });

  it('allows an IAM user with no password', () => {
    const { state, instance } = withInstance();
    const result = createSqlUser(state, {
      instanceId: instance.id,
      name: 'erp-sa',
      password: '',
      type: 'CLOUD_IAM_SERVICE_ACCOUNT',
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.user.passwordHint).toBe('managed by IAM');
  });

  it('refuses to create databases or users on a stopped instance', () => {
    const { state, instance } = withInstance();
    const stopped = stopSqlInstance(state, instance.id);
    if (!stopped.ok) throw new Error(stopped.message);
    const db = createSqlDatabase(stopped.value.state, { instanceId: instance.id, name: 'x' });
    expect(codeOf(db)).toBe('NOT_READY');
    const user = createSqlUser(stopped.value.state, { instanceId: instance.id, name: 'y', password: 'password1' });
    expect(codeOf(user)).toBe('NOT_READY');
  });
});

describe('Cloud SQL backup rules', () => {
  function withInstance() {
    const created = createSqlInstance(createInitialState(), base);
    if (!created.ok) throw new Error(created.message);
    return created.value;
  }

  it('takes an on-demand backup sized to storage', () => {
    const { state, instance } = withInstance();
    const result = createBackup(state, { instanceId: instance.id });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.backup.sizeGb).toBe(instance.storageGb);
    expect(result.value.backup.retained).toBe(true);
  });

  it('lets on-demand backups be deleted', () => {
    const { state, instance } = withInstance();
    const backup = createBackup(state, { instanceId: instance.id });
    if (!backup.ok) throw new Error(backup.message);
    expect(deleteBackup(backup.value.state, backup.value.backup.id).ok).toBe(true);
  });

  it('refuses to delete an automated backup', () => {
    const { state, instance } = withInstance();
    const backup = createBackup(state, { instanceId: instance.id, type: 'AUTOMATED' });
    if (!backup.ok) throw new Error(backup.message);
    const result = deleteBackup(backup.value.state, backup.value.backup.id);
    expect(codeOf(result)).toBe('INVALID_STATE');
    expect(fixOf(result)).toMatch(/roll off/i);
  });

  it('lists backups per instance', () => {
    const { state, instance } = withInstance();
    const backup = createBackup(state, { instanceId: instance.id });
    if (!backup.ok) throw new Error(backup.message);
    expect(backupsOf(backup.value.state, instance.id)).toHaveLength(1);
  });
});

describe('Cloud SQL deletion rules', () => {
  function withInstance() {
    const created = createSqlInstance(createInitialState(), base);
    if (!created.ok) throw new Error(created.message);
    return created.value;
  }

  it('requires a cascade when databases remain', () => {
    const { state, instance } = withInstance();
    const result = deleteSqlInstance(state, instance.id);
    expect(codeOf(result)).toBe('DEPENDENCY');
  });

  it('cascade deletes databases, users and backups', () => {
    const { state, instance } = withInstance();
    createSqlDatabase(state, { instanceId: instance.id, name: 'orders' });
    createSqlUser(state, { instanceId: instance.id, name: 'app', password: 'password1' });
    createBackup(state, { instanceId: instance.id });
    const result = deleteSqlInstance(state, instance.id, { cascade: true });
    if (!result.ok) throw new Error(result.message);
    const after = result.value.state;
    expect(after.sqlInstances.find((i) => i.id === instance.id)).toBeUndefined();
    expect(after.sqlDatabases.filter((d) => d.instanceId === instance.id)).toHaveLength(0);
    expect(after.sqlUsers.filter((u) => u.instanceId === instance.id)).toHaveLength(0);
    expect(after.sqlBackups.filter((b) => b.instanceId === instance.id)).toHaveLength(0);
  });

  it('blocks deletion while deletion protection is on', () => {
    const { state, instance } = withInstance();
    const protectedState = setProtection(state, instance.id);
    if (!protectedState.ok) throw new Error(protectedState.message);
    const result = deleteSqlInstance(protectedState.value.state, instance.id, { cascade: true });
    expect(codeOf(result)).toBe('INVALID_STATE');
    expect(fixOf(result)).toMatch(/deletion protection/i);
  });

  it('allows deletion after protection is removed', () => {
    const { state, instance } = withInstance();
    const protectedState = setProtection(state, instance.id);
    if (!protectedState.ok) throw new Error(protectedState.message);
    const opened = setDeletionProtection(protectedState.value.state, instance.id, false);
    if (!opened.ok) throw new Error(opened.message);
    expect(deleteSqlInstance(opened.value.state, instance.id, { cascade: true }).ok).toBe(true);
  });
});

function setProtection(state: ReturnType<typeof createInitialState>, id: string) {
  return setDeletionProtection(state, id, true);
}

describe('Cloud SQL instance controls', () => {
  function withInstance() {
    const created = createSqlInstance(createInitialState(), base);
    if (!created.ok) throw new Error(created.message);
    return created.value;
  }

  it('stops and restarts an instance', () => {
    const { state, instance } = withInstance();
    const stopped = stopSqlInstance(state, instance.id);
    if (!stopped.ok) throw new Error(stopped.message);
    expect(stopped.value.state.sqlInstances[0].state).toBe('STOPPED');
    expect(connectionEndpoint(stopped.value.state.sqlInstances[0])).toBeUndefined();
    const started = restartSqlInstance(stopped.value.state, instance.id);
    if (!started.ok) throw new Error(started.message);
    expect(started.value.state.sqlInstances[0].state).toBe('RUNNABLE');
  });

  it('refuses redundant start and stop operations', () => {
    const { state, instance } = withInstance();
    const stopped = stopSqlInstance(state, instance.id);
    if (!stopped.ok) throw new Error(stopped.message);
    // A second stop has nothing left to do.
    expect(codeOf(stopSqlInstance(stopped.value.state, instance.id))).toBe('INVALID_STATE');
    const started = restartSqlInstance(stopped.value.state, instance.id);
    if (!started.ok) throw new Error(started.message);
    // Restarting an already running instance is also a no-op.
    expect(codeOf(restartSqlInstance(started.value.state, instance.id))).toBe('INVALID_STATE');
  });

  it('toggles point-in-time recovery', () => {
    const { state, instance } = withInstance();
    const result = setPointInTimeRecovery(state, instance.id, true);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.state.sqlInstances[0].pointInTimeRecoveryEnabled).toBe(true);
  });

  it('leaves the VPC alone when an instance is deleted', () => {
    const net = lab();
    const created = createSqlInstance(net, { ...base, vpcId: net.vpcs[0].id, connectivity: 'PRIVATE' });
    if (!created.ok) throw new Error(created.message);
    const vm = createVm(created.value.state, {
      name: 'client',
      subnetId: net.subnets[0].id,
      zone: 'us-central1-a',
      machineType: 'e2-micro',
    });
    if (!vm.ok) throw new Error(vm.message);
    const deleted = deleteSqlInstance(vm.value.state, created.value.instance.id, { cascade: true });
    if (!deleted.ok) throw new Error(deleted.message);
    expect(deleted.value.state.vpcs).toHaveLength(1);
    expect(deleted.value.state.vms).toHaveLength(1);
  });
});