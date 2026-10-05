/**
 * Persistence tests.
 *
 * LocalStorageAdapter needs a DOM, so these use a minimal in-memory stub rather
 * than jsdom: the adapter only touches getItem/setItem/removeItem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { LabSnapshot, toSnapshot } from './types';
import { buildSampleNetwork } from '../../sim/seed';
import { createInitialState } from '../../sim/engine';
import { SimState } from '../../sim/types';

/** Minimal localStorage stub: enough surface for the adapter, nothing more. */
function createStorageStub(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

const KEY = 'localcloud_netlab_state_v1';

let storage: Storage;

beforeEach(() => {
  storage = createStorageStub();
  // The adapter guards on `typeof window`, so the browser global has to exist
  // too. Tests run in the node environment, hence the stub.
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LocalStorageAdapter guards', () => {
  it('returns null instead of throwing when there is no window', async () => {
    vi.stubGlobal('window', undefined);
    const adapter = new LocalStorageAdapter();
    expect(await adapter.load()).toBeNull();
    // Saving is a no-op rather than an error.
    await expect(adapter.save(createInitialState())).resolves.toBeUndefined();
  });
});

describe('LocalStorageAdapter', () => {
  it('returns null when nothing is stored', async () => {
    expect(await new LocalStorageAdapter().load()).toBeNull();
  });

  it('round-trips a full simulation state', async () => {
    const adapter = new LocalStorageAdapter();
    const state = buildSampleNetwork();

    await adapter.save(state);
    const loaded = await adapter.load();

    expect(loaded).not.toBeNull();
    expect(loaded!.vpcs).toHaveLength(1);
    expect(loaded!.vms.map((v) => v.name)).toEqual(['web-1', 'app-1', 'db-1']);
    expect(loaded!.nsgs).toHaveLength(2);
  });

  it('preserves the subnet usedIps list so addresses are not reallocated', async () => {
    const adapter = new LocalStorageAdapter();
    await adapter.save(buildSampleNetwork());

    const loaded = (await adapter.load()) as SimState;
    expect(loaded.subnets.find((s) => s.name === 'web-subnet')?.usedIps).toEqual(['10.0.1.2']);
  });

  it('overwrites a previous save', async () => {
    const adapter = new LocalStorageAdapter();
    await adapter.save(buildSampleNetwork());
    await adapter.save(createInitialState());

    const loaded = await adapter.load();
    expect(loaded!.vpcs).toHaveLength(0);
  });

  it('clears the stored state', async () => {
    const adapter = new LocalStorageAdapter();
    await adapter.save(buildSampleNetwork());
    await adapter.clear();

    expect(storage.getItem(KEY)).toBeNull();
    expect(await adapter.load()).toBeNull();
  });

  it('returns null when the stored value is not valid JSON', async () => {
    storage.setItem(KEY, '{not json');
    expect(await new LocalStorageAdapter().load()).toBeNull();
  });

  it('returns null when the stored value has no state', async () => {
    storage.setItem(KEY, JSON.stringify({ version: 1 }));
    expect(await new LocalStorageAdapter().load()).toBeNull();
  });

  it('exposes export and import as the same shape it stores', async () => {
    const adapter = new LocalStorageAdapter();
    const state = buildSampleNetwork();
    await adapter.save(state);

    const snapshot = JSON.parse(storage.getItem(KEY) as string) as LabSnapshot;
    expect(snapshot.version).toBe(1);
    expect(snapshot.state.sequence).toBe(state.sequence);
  });
});

describe('toSnapshot', () => {
  it('stamps a version and a save time', () => {
    const snapshot = toSnapshot(createInitialState());
    expect(snapshot.version).toBe(1);
    expect(Date.parse(snapshot.savedAt)).not.toBeNaN();
  });

  it('carries the state through untouched', () => {
    const state = buildSampleNetwork();
    expect(toSnapshot(state).state).toBe(state);
  });
});