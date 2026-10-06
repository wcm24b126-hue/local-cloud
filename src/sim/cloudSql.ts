import type {
  SimState,
  SqlInstance,
  SqlDatabase,
  SqlUser,
  SqlBackup,
  SimResult,
  SqlEngineVersion,
} from './types';
import { ok, err } from './types';
import { nextId, logEvent, validateName, duplicateName, findVpc, findSubnet } from './engine';

/* ------------------------------------------------------------------ */
/* engines and tiers                                                   */
/* ------------------------------------------------------------------ */

/** Everything Cloud SQL and AlloyDB let you pick in this simulator. */
export const SQL_ENGINES: readonly SqlEngineVersion[] = [
  'POSTGRES_14',
  'POSTGRES_16',
  'MYSQL_8_0',
  'SQLSERVER_2022_STANDARD',
  'ALLOYDB',
];

/** Tier -> CPU cores and RAM in MiB, mirroring the Cloud SQL naming scheme. */
const TIER_SHAPE: Record<string, { cpu: number; ramMiB: number; kind: 'sql' | 'alloydb' }> = {
  'db-f1-micro': { cpu: 0.2, ramMiB: 614, kind: 'sql' },
  'db-g1-small': { cpu: 0.5, ramMiB: 1700, kind: 'sql' },
  'db-custom-1-3840': { cpu: 1, ramMiB: 3840, kind: 'sql' },
  'db-custom-2-7680': { cpu: 2, ramMiB: 7680, kind: 'sql' },
  'db-custom-4-15360': { cpu: 4, ramMiB: 15360, kind: 'sql' },
  'db-n1-standard-2': { cpu: 2, ramMiB: 8192, kind: 'sql' },
  'db-n1-standard-4': { cpu: 4, ramMiB: 16384, kind: 'sql' },
  'db-perf-optimized-N': { cpu: 2, ramMiB: 8192, kind: 'alloydb' },
  'db-perf-optimized-N-2': { cpu: 4, ramMiB: 16384, kind: 'alloydb' },
  'db-perf-optimized-N-4': { cpu: 8, ramMiB: 32768, kind: 'alloydb' },
};

export function isAlloydb(engine: SqlEngineVersion): boolean {
  return engine === 'ALLOYDB';
}

export function tiersForEngine(engine: SqlEngineVersion): string[] {
  const kind = isAlloydb(engine) ? 'alloydb' : 'sql';
  return Object.entries(TIER_SHAPE)
    .filter(([, shape]) => shape.kind === kind)
    .map(([tier]) => tier);
}

export function tierShape(tier: string): { cpu: number; ramMiB: number } {
  return TIER_SHAPE[tier] ?? { cpu: 1, ramMiB: 3840 };
}

/** AlloyDB primary storage starts at 100 GiB; Cloud SQL at 10 GiB. */
function defaultStorageGb(engine: SqlEngineVersion): number {
  return isAlloydb(engine) ? 100 : 20;
}

export const ENGINE_LABELS: Record<SqlEngineVersion, string> = {
  POSTGRES_14: 'PostgreSQL 14',
  POSTGRES_16: 'PostgreSQL 16',
  MYSQL_8_0: 'MySQL 8.0',
  SQLSERVER_2022_STANDARD: 'SQL Server 2022 Standard',
  ALLOYDB: 'AlloyDB (PostgreSQL-compatible)',
};

/* ------------------------------------------------------------------ */
/* private IP allocation                                               */
/* ------------------------------------------------------------------ */

/**
 * Cloud SQL private IPs come out of the VPC's secondary range, not the subnet
 * range used by VMs, so we offset into 10.x.y.0/24 space derived from the vpc.
 */
function allocatePrivateIp(state: SimState, vpcId: string): string | undefined {
  const vpc = findVpc(state, vpcId);
  if (!vpc) return undefined;
  const taken = new Set(
    state.sqlInstances
      .filter((i) => i.vpcId === vpcId && i.privateIp)
      .map((i) => i.privateIp as string)
  );
  for (let octet = 10; octet < 250; octet += 1) {
    const candidate = `10.128.0.${octet}`;
    if (!taken.has(candidate)) return candidate;
  }
  return undefined;
}

/** Public IPs sit in the same space the lab hands out to load balancers. */
function allocatePublicIp(state: SimState, used: number): string {
  return `35.190.0.${100 + used}`;
}

export function findSqlInstance(state: SimState, id: string): SqlInstance | undefined {
  return state.sqlInstances.find((i) => i.id === id);
}

/* ------------------------------------------------------------------ */
/* instances                                                           */
/* ------------------------------------------------------------------ */

export interface CreateSqlInstanceInput {
  name: string;
  engine: SqlEngineVersion;
  region: string;
  tier: string;
  storageGb?: number;
  vpcId?: string;
  subnetId?: string;
  /** PUBLIC instances get a public IP; PRIVATE needs a VPC. */
  connectivity: 'PRIVATE' | 'PUBLIC';
  deletionProtection?: boolean;
  automatedBackupEnabled?: boolean;
  automatedBackupRetentionDays?: number;
  pointInTimeRecoveryEnabled?: boolean;
  ipv4Enabled?: boolean;
  privateServiceAccess?: boolean;
}

export function createSqlInstance(
  state: SimState,
  input: CreateSqlInstanceInput
): SimResult<{ state: SimState; instance: SqlInstance }> {
  const nameProblem = validateName(input.name, 'instance');
  if (nameProblem) return nameProblem;
  if (duplicateName(state.sqlInstances, input.name, 'instance')) {
    return err('DUPLICATE_NAME', `Instance "${input.name}" already exists.`, 'Pick a different instance name.');
  }
  if (!SQL_ENGINES.includes(input.engine)) {
    return err('INVALID_ARGUMENT', `Unsupported engine "${input.engine}".`, 'Choose one of the listed engines.');
  }
  if (!TIER_SHAPE[input.tier]) {
    return err('INVALID_ARGUMENT', `Unknown tier "${input.tier}".`, 'Pick a tier from the list for this engine.');
  }
  if (isAlloydb(input.engine) && TIER_SHAPE[input.tier].kind !== 'alloydb') {
    return err('INVALID_ARGUMENT', 'AlloyDB needs a db-perf-optimized-N tier.', 'Choose an AlloyDB tier, or switch the engine to Cloud SQL.');
  }
  if (!isAlloydb(input.engine) && TIER_SHAPE[input.tier].kind !== 'sql') {
    return err('INVALID_ARGUMENT', 'AlloyDB tiers are not valid for Cloud SQL.', 'Choose a db-custom or db-n1 tier for Cloud SQL.');
  }

  // A private instance has to live inside a VPC, exactly like the real service.
  let next = state;
  let privateIp: string | undefined;
  let publicIp: string | undefined;
  if (input.connectivity === 'PRIVATE') {
    if (!input.vpcId || !findVpc(state, input.vpcId)) {
      return err(
        'DEPENDENCY',
        'A private instance needs a VPC.',
        'Create a VPC first, then set the instance networking to Private IP.'
      );
    }
    if (input.subnetId && !findSubnet(state, input.subnetId)) {
      return err('NOT_FOUND', 'The chosen subnet no longer exists.', 'Pick an existing subnet, or leave the subnet blank.');
    }
    privateIp = allocatePrivateIp(state, input.vpcId);
    if (!privateIp) {
      return err('IP_EXHAUSTED', 'No private IP addresses left in this VPC.', 'Create another VPC for more instances.');
    }
  } else {
    publicIp = allocatePublicIp(state, state.sqlInstances.length);
  }

  const storageGb = input.storageGb ?? defaultStorageGb(input.engine);
  if (!Number.isFinite(storageGb) || storageGb < 10) {
    return err('INVALID_ARGUMENT', 'Storage must be at least 10 GiB.', 'Raise the storage size and try again.');
  }

  const idResult = nextId(next, 'sql');
  const id = idResult.id;
  next = idResult.state;

  const instance: SqlInstance = {
    id,
    name: input.name,
    engine: input.engine,
    region: input.region,
    tier: input.tier,
    storageGb,
    storageAutoResize: true,
    vpcId: input.vpcId,
    privateIp,
    publicIp,
    connectivity: input.connectivity,
    state: 'RUNNABLE',
    deletionProtection: input.deletionProtection ?? false,
    automatedBackupEnabled: input.automatedBackupEnabled ?? true,
    automatedBackupRetentionDays: input.automatedBackupRetentionDays ?? 7,
    pointInTimeRecoveryEnabled: input.pointInTimeRecoveryEnabled ?? false,
    ipv4Enabled: input.ipv4Enabled ?? false,
    privateServiceAccess: input.privateServiceAccess ?? input.connectivity === 'PRIVATE',
    createdAt: new Date().toISOString(),
  };

  next = {
    ...next,
    sqlInstances: [...next.sqlInstances, instance],
    // Every instance ships with the default database, as the real service does.
    sqlDatabases: [
      ...next.sqlDatabases,
      {
        id: `${id}-db-default`,
        instanceId: id,
        name: 'default',
        charset: input.engine === 'MYSQL_8_0' ? 'utf8mb4' : 'UTF8',
        collation: input.engine === 'MYSQL_8_0' ? 'utf8mb4_0900_ai_ci' : 'en_US.UTF8',
        onlineDdl: isAlloydb(input.engine),
        createdAt: instance.createdAt,
      },
    ],
  };
  next = logEvent(next, 'cloudsql.instances.create', `instances/${input.name}`, 'SUCCESS', `${input.engine} ${input.tier}`);

  return ok({ state: next, instance }, `Instance "${input.name}" created with a ${input.engine} engine.`);
}

/** AlloyDB calls this a cluster; the console shows the same object under both names. */
export function isClusterLabel(instance: SqlInstance): boolean {
  return isAlloydb(instance.engine);
}

export function restartSqlInstance(state: SimState, id: string): SimResult<{ state: SimState }> {
  const instance = findSqlInstance(state, id);
  if (!instance) return err('NOT_FOUND', 'Instance not found.', 'Refresh the list; the instance may be gone.');
  if (instance.state === 'RUNNABLE') {
    return err('INVALID_STATE', `Instance "${instance.name}" is already running.`, 'Stop it first if you want to restart it.');
  }
  return ok({ state: logEvent({ ...state, sqlInstances: state.sqlInstances.map((i) => (i.id === id ? { ...i, state: 'RUNNABLE' } : i)) }, 'cloudsql.instances.restart', `instances/${instance.name}`, 'SUCCESS') }, `Instance "${instance.name}" restarted.`);
}

export function stopSqlInstance(state: SimState, id: string): SimResult<{ state: SimState }> {
  const instance = findSqlInstance(state, id);
  if (!instance) return err('NOT_FOUND', 'Instance not found.', 'Refresh the list; the instance may be gone.');
  if (instance.state === 'STOPPED') {
    return err('INVALID_STATE', `Instance "${instance.name}" is already stopped.`, 'Start it from the instance page.');
  }
  const next = {
    ...state,
    sqlInstances: state.sqlInstances.map((i) => (i.id === id ? { ...i, state: 'STOPPED' as const } : i)),
  };
  return ok({ state: logEvent(next, 'cloudsql.instances.stop', `instances/${instance.name}`, 'SUCCESS') }, `Instance "${instance.name}" stopped. Billing stops too.`);
}

export function setDeletionProtection(state: SimState, id: string, enabled: boolean): SimResult<{ state: SimState }> {
  const instance = findSqlInstance(state, id);
  if (!instance) return err('NOT_FOUND', 'Instance not found.', 'Refresh the list; the instance may be gone.');
  const next = {
    ...state,
    sqlInstances: state.sqlInstances.map((i) => (i.id === id ? { ...i, deletionProtection: enabled } : i)),
  };
  return ok(
    { state: logEvent(next, 'cloudsql.instances.patch', `instances/${instance.name}`, 'SUCCESS', `deletionProtection=${enabled}`) },
    `Deletion protection ${enabled ? 'enabled' : 'disabled'} on "${instance.name}".`
  );
}

export function deleteSqlInstance(
  state: SimState,
  id: string,
  options: { cascade?: boolean } = {}
): SimResult<{ state: SimState }> {
  const instance = findSqlInstance(state, id);
  if (!instance) return err('NOT_FOUND', 'Instance not found.', 'Refresh the list; the instance may be gone.');

  // Protection blocks the delete unless it is explicitly removed first.
  if (instance.deletionProtection) {
    return err(
      'INVALID_STATE',
      `Instance "${instance.name}" has deletion protection.`,
      'Turn off deletion protection on the instance page, then delete it.'
    );
  }

  const databases = state.sqlDatabases.filter((d) => d.instanceId === id);
  if (databases.length > 0 && !options.cascade) {
    return err(
      'DEPENDENCY',
      `Instance "${instance.name}" still has ${databases.length} database(s).`,
      'Delete the databases first, or delete the instance with force so they are removed too.'
    );
  }

  const next: SimState = {
    ...state,
    sqlInstances: state.sqlInstances.filter((i) => i.id !== id),
    sqlDatabases: state.sqlDatabases.filter((d) => d.instanceId !== id),
    sqlUsers: state.sqlUsers.filter((u) => u.instanceId !== id),
    sqlBackups: state.sqlBackups.filter((b) => b.instanceId !== id),
  };
  return ok(
    { state: logEvent(next, 'cloudsql.instances.delete', `instances/${instance.name}`, 'SUCCESS', 'databases and users removed') },
    `Instance "${instance.name}" deleted along with its databases and users.`
  );
}

/* ------------------------------------------------------------------ */
/* databases                                                           */
/* ------------------------------------------------------------------ */

/** SQL Server only supports a fixed list of database names, as the real service does. */
const SQLSERVER_RESERVED = new Set([
  'master',
  'msdb',
  'model',
  'tempdb',
  'resource',
  'admin',
  'guest',
  'distribution',
  'mssqlsystemresource',
  'msdbccccrt',
  'msdbccvws',
]);

export function createSqlDatabase(
  state: SimState,
  input: { instanceId: string; name: string; charset?: string; collation?: string }
): SimResult<{ state: SimState; database: SqlDatabase }> {
  const instance = findSqlInstance(state, input.instanceId);
  if (!instance) return err('NOT_FOUND', 'Instance not found.', 'Create the instance first.');
  if (!input.name.trim()) {
    return err('INVALID_NAME', 'Database name is required.', 'Enter a name for the database.');
  }
  const problem = validateName(input.name, 'database');
  if (problem) return problem;

  // Instance names collide with database names only inside the same instance.
  if (duplicateName(state.sqlDatabases.filter((d) => d.instanceId === input.instanceId), input.name, 'database')) {
    return err('DUPLICATE_NAME', `Database "${input.name}" already exists on this instance.`, 'Pick a different database name.');
  }
  if (instance.engine === 'SQLSERVER_2022_STANDARD' && SQLSERVER_RESERVED.has(input.name.toLowerCase())) {
    return err(
      'INVALID_NAME',
      `"${input.name}" is reserved by SQL Server.`,
      'Reserved names such as master, msdb and model cannot be used.'
    );
  }
  if (instance.state === 'STOPPED') {
    return err('NOT_READY', `Instance "${instance.name}" is stopped.`, 'Start the instance before creating a database.');
  }

  const idResult = nextId(state, 'sqldb');
  const database: SqlDatabase = {
    id: idResult.id,
    instanceId: input.instanceId,
    name: input.name,
    charset: input.charset ?? (instance.engine === 'MYSQL_8_0' ? 'utf8mb4' : 'UTF8'),
    collation: input.collation ?? (instance.engine === 'MYSQL_8_0' ? 'utf8mb4_0900_ai_ci' : 'en_US.UTF8'),
    onlineDdl: isAlloydb(instance.engine),
    createdAt: new Date().toISOString(),
  };
  const next = {
    ...idResult.state,
    sqlDatabases: [...idResult.state.sqlDatabases, database],
  };
  return ok(
    { state: logEvent(next, 'cloudsql.databases.create', `instances/${instance.name}/databases/${input.name}`, 'SUCCESS'), database },
    `Database "${input.name}" created on "${instance.name}".`
  );
}

export function deleteSqlDatabase(state: SimState, id: string): SimResult<{ state: SimState }> {
  const database = state.sqlDatabases.find((d) => d.id === id);
  if (!database) return err('NOT_FOUND', 'Database not found.', 'Refresh the list; it may already be deleted.');
  const instance = findSqlInstance(state, database.instanceId);
  // The default database cannot be dropped, matching Cloud SQL behaviour.
  if (database.name === 'default') {
    return err(
      'INVALID_STATE',
      'The default database cannot be deleted.',
      'Create a separate database for your data and delete that instead.'
    );
  }
  // Users belong to the instance, not to a database, so dropping a database
  // leaves every user on that instance untouched.
  const next = {
    ...state,
    sqlDatabases: state.sqlDatabases.filter((d) => d.id !== id),
  };
  return ok(
    { state: logEvent(next, 'cloudsql.databases.delete', `instances/${instance?.name}/databases/${database.name}`, 'SUCCESS') },
    `Database "${database.name}" deleted.`
  );
}

/* ------------------------------------------------------------------ */
/* users                                                               */
/* ------------------------------------------------------------------ */

export function createSqlUser(
  state: SimState,
  input: { instanceId: string; name: string; password: string; type?: SqlUser['type'] }
): SimResult<{ state: SimState; user: SqlUser }> {
  const instance = findSqlInstance(state, input.instanceId);
  if (!instance) return err('NOT_FOUND', 'Instance not found.', 'Create the instance first.');

  const problem = validateName(input.name, 'user');
  if (problem) return problem;

  const type = input.type ?? 'BUILT_IN';
  if (type === 'BUILT_IN') {
    // Built-in users live at the instance root, not inside a database.
    if (duplicateName(state.sqlUsers.filter((u) => u.instanceId === input.instanceId), input.name, 'user')) {
      return err('DUPLICATE_NAME', `User "${input.name}" already exists on this instance.`, 'Pick a different user name.');
    }
    if (input.password.length < 8) {
      return err('INVALID_ARGUMENT', 'Password must be at least 8 characters.', 'Use a longer password, or switch to a Cloud IAM service account.');
    }
  }
  if (instance.state === 'STOPPED') {
    return err('NOT_READY', `Instance "${instance.name}" is stopped.`, 'Start the instance before adding users.');
  }

  const idResult = nextId(state, 'sqlusr');
  const user: SqlUser = {
    id: idResult.id,
    instanceId: input.instanceId,
    name: input.name,
    type,
    // Store only a length hint, so the console can never leak the secret.
    passwordHint: type === 'BUILT_IN' ? `${input.password.length} characters` : 'managed by IAM',
    createdAt: new Date().toISOString(),
  };
  const next = { ...idResult.state, sqlUsers: [...idResult.state.sqlUsers, user] };
  return ok(
    { state: logEvent(next, 'cloudsql.users.create', `instances/${instance.name}/users/${input.name}`, 'SUCCESS', type), user },
    type === 'BUILT_IN'
      ? `User "${input.name}" created on "${instance.name}".`
      : `IAM principal "${input.name}" granted access to "${instance.name}".`
  );
}

export function deleteSqlUser(state: SimState, id: string): SimResult<{ state: SimState }> {
  const user = state.sqlUsers.find((u) => u.id === id);
  if (!user) return err('NOT_FOUND', 'User not found.', 'Refresh the list; it may already be removed.');
  const instance = findSqlInstance(state, user.instanceId);
  const next = { ...state, sqlUsers: state.sqlUsers.filter((u) => u.id !== id) };
  return ok(
    { state: logEvent(next, 'cloudsql.users.delete', `instances/${instance?.name}/users/${user.name}`, 'SUCCESS') },
    `User "${user.name}" removed.`
  );
}

/* ------------------------------------------------------------------ */
/* backups                                                             */
/* ------------------------------------------------------------------ */

export function createBackup(
  state: SimState,
  input: { instanceId: string; type?: SqlBackup['type'] }
): SimResult<{ state: SimState; backup: SqlBackup }> {
  const instance = findSqlInstance(state, input.instanceId);
  if (!instance) return err('NOT_FOUND', 'Instance not found.', 'Create the instance first.');
  if (instance.state === 'STOPPED') {
    return err('NOT_READY', `Instance "${instance.name}" is stopped.`, 'Start the instance before taking a backup.');
  }
  const type = input.type ?? 'ON_DEMAND';
  const idResult = nextId(state, 'sqlbak');
  // Backups start at roughly the provisioned storage size.
  const backup: SqlBackup = {
    id: idResult.id,
    instanceId: input.instanceId,
    type,
    state: 'SUCCESSFUL',
    sizeGb: instance.storageGb,
    retained: type === 'ON_DEMAND',
    createdAt: new Date().toISOString(),
  };
  const next = { ...idResult.state, sqlBackups: [...idResult.state.sqlBackups, backup] };
  return ok(
    { state: logEvent(next, 'cloudsql.backups.create', `instances/${instance.name}/backups`, 'SUCCESS', type), backup },
    `Backup of "${instance.name}" completed.`
  );
}

export function deleteBackup(state: SimState, id: string): SimResult<{ state: SimState }> {
  const backup = state.sqlBackups.find((b) => b.id === id);
  if (!backup) return err('NOT_FOUND', 'Backup not found.', 'Refresh the list; it may already be deleted.');
  // Automated backups cannot be deleted by hand; they expire on their own.
  if (backup.type === 'AUTOMATED') {
    return err(
      'INVALID_STATE',
      'Automated backups cannot be deleted.',
      'They roll off automatically after the retention period. Take an on-demand backup instead.'
    );
  }
  const next = { ...state, sqlBackups: state.sqlBackups.filter((b) => b.id !== id) };
  return ok({ state: logEvent(next, 'cloudsql.backups.delete', backup.id, 'SUCCESS') }, 'Backup deleted.');
}

export function setPointInTimeRecovery(
  state: SimState,
  id: string,
  enabled: boolean
): SimResult<{ state: SimState }> {
  const instance = findSqlInstance(state, id);
  if (!instance) return err('NOT_FOUND', 'Instance not found.', 'Refresh the list; the instance may be gone.');
  const next = {
    ...state,
    sqlInstances: state.sqlInstances.map((i) => (i.id === id ? { ...i, pointInTimeRecoveryEnabled: enabled } : i)),
  };
  return ok(
    { state: logEvent(next, 'cloudsql.instances.patch', `instances/${instance.name}`, 'SUCCESS', `pointInTimeRecovery=${enabled}`) },
    `Point-in-time recovery ${enabled ? 'enabled' : 'disabled'} on "${instance.name}".`
  );
}

/* ------------------------------------------------------------------ */
/* derived helpers for the console                                     */
/* ------------------------------------------------------------------ */

export function databasesOf(state: SimState, instanceId: string): SqlDatabase[] {
  return state.sqlDatabases.filter((d) => d.instanceId === instanceId);
}

export function usersOf(state: SimState, instanceId: string): SqlUser[] {
  return state.sqlUsers.filter((u) => u.instanceId === instanceId);
}

export function backupsOf(state: SimState, instanceId: string): SqlBackup[] {
  return state.sqlBackups.filter((b) => b.instanceId === instanceId);
}

/** The endpoint a client would actually connect to. */
export function connectionEndpoint(instance: SqlInstance): string | undefined {
  if (instance.state === 'STOPPED') return undefined;
  return instance.privateIp ?? instance.publicIp;
}