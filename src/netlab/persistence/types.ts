/**
 * Persistence adapter interface.
 *
 * Two implementations exist: LocalStorageAdapter (the default, zero setup) and
 * PostgresAdapter (used only when DATABASE_URL is set). Both store the exact
 * same JSON snapshot, so switching backends never changes behaviour.
 */

import { SimState } from '../../sim/types';

export interface LabSnapshot {
  version: 1;
  savedAt: string;
  state: SimState;
}

export interface PersistenceAdapter {
  readonly name: string;
  /** Load the lab, or null when nothing has been saved yet. */
  load(): Promise<SimState | null>;
  /** Persist the whole lab snapshot. */
  save(state: SimState): Promise<void>;
  /** Clear all persisted data. */
  clear(): Promise<void>;
}

/** Wrap a state as a versioned snapshot. */
export function toSnapshot(state: SimState): LabSnapshot {
  return { version: 1, savedAt: new Date().toISOString(), state };
}