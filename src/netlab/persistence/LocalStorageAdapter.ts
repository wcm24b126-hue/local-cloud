/**
 * Default persistence: browser localStorage.
 *
 * Chosen whenever DATABASE_URL is absent, so the lab always runs with zero
 * configuration. Includes export/import as a JSON string so a learner can move
 * a lab between machines.
 */

import { SimState } from '../../sim/types';
import { LabSnapshot, PersistenceAdapter, toSnapshot } from './types';

const STORAGE_KEY = 'localcloud_netlab_state_v1';

export class LocalStorageAdapter implements PersistenceAdapter {
  readonly name = 'localStorage';

  /** localStorage is unavailable during SSR and in private-mode edge cases. */
  private get storage(): Storage | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage;
    } catch {
      return null;
    }
  }

  async load(): Promise<SimState | null> {
    const storage = this.storage;
    if (!storage) return null;

    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
      const snapshot = JSON.parse(raw) as LabSnapshot;
      if (snapshot?.version !== 1 || !snapshot.state) return null;
      return snapshot.state;
    } catch {
      // Corrupt payload: drop it rather than crashing the app on boot.
      storage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  async save(state: SimState): Promise<void> {
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(toSnapshot(state)));
  }

  async clear(): Promise<void> {
    this.storage?.removeItem(STORAGE_KEY);
  }

  /** Serialise the lab for download. */
  export(state: SimState): string {
    return JSON.stringify(toSnapshot(state), null, 2);
  }

  /**
   * Parse an exported lab file. Returns null when the payload is not a valid
   * LocalCloud snapshot so the caller can show a clear error.
   */
  import(raw: string): SimState | null {
    try {
      const parsed = JSON.parse(raw) as LabSnapshot;
      if (parsed?.version !== 1 || !parsed.state?.vpcs) return null;
      return parsed.state;
    } catch {
      return null;
    }
  }
}