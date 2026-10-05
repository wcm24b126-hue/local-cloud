/**
 * Persistence selection for the networking lab.
 *
 * localStorage is the guaranteed store: it always works and needs no setup. When
 * the server reports that Postgres is available, the lab is mirrored there too,
 * so a learner can move between machines without losing work.
 *
 * The browser never reads DATABASE_URL itself, since it is a secret.
 */

import { HttpAdapter } from './HttpAdapter';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { PersistenceAdapter } from './types';
import { SimState } from '../../sim/types';

export { LocalStorageAdapter } from './LocalStorageAdapter';
export { HttpAdapter } from './HttpAdapter';
export type { PersistenceAdapter, LabSnapshot } from './types';

/** localStorage first, server second. */
class MirrorAdapter implements PersistenceAdapter {
  readonly name = 'postgres + localStorage';

  constructor(
    private readonly primary: LocalStorageAdapter,
    private readonly secondary: HttpAdapter
  ) {}

  async load(): Promise<SimState | null> {
    const local = await this.primary.load();
    if (local) return local;

    // Nothing local: adopt the server copy and mirror it down.
    const remote = await this.secondary.load();
    if (remote) await this.primary.save(remote);
    return remote;
  }

  async save(state: SimState): Promise<void> {
    await this.primary.save(state);
    await this.secondary.save(state);
  }

  async clear(): Promise<void> {
    await this.primary.clear();
    await this.secondary.clear();
  }
}

/**
 * Resolve the persistence adapter by asking the server which backend is active.
 * Falls back to localStorage whenever the probe fails, is slow, or the server
 * reports no database.
 */
export async function createPersistenceAdapter(): Promise<PersistenceAdapter> {
  const local = new LocalStorageAdapter();
  if (typeof fetch === 'undefined') return local;

  try {
    const backend = await new HttpAdapter().probe();
    return backend === 'postgres' ? new MirrorAdapter(local, new HttpAdapter()) : local;
  } catch {
    return local;
  }
}