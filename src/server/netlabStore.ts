/**
 * Postgres persistence, used only when DATABASE_URL is set on the server.
 *
 * The whole lab is stored as one JSONB document. That keeps the schema to a
 * single table that is auto-created on first run, which satisfies "always runs
 * with zero setup" while still persisting to a real database when one is
 * available.
 *
 * This module is server-only: `pg` is a Node library and DATABASE_URL is a
 * secret that must never reach the browser bundle. The browser talks to the
 * `/api/netlab/state` route instead, via PostgresAdapter in this directory.
 *
 * If Postgres is unreachable every method degrades gracefully: `load` returns
 * null and `save` swallows the error, so the app falls back to localStorage
 * instead of breaking.
 */

import type { Pool } from 'pg';
import { SimState } from '../sim/types';
import { LabSnapshot, toSnapshot } from '../netlab/persistence/types';

/** Stable key: one saved lab per project. */
const SNAPSHOT_ID = 'default';

export interface ServerStore {
  load(): Promise<SimState | null>;
  save(state: SimState): Promise<void>;
  clear(): Promise<void>;
}

/** Return true when a DATABASE_URL was provided. */
export function hasDatabaseUrl(databaseUrl: string | undefined): boolean {
  return typeof databaseUrl === 'string' && databaseUrl.trim().length > 0;
}

/**
 * Build the Postgres-backed store. Returns null when no DATABASE_URL is set so
 * the caller can report that persistence is running on localStorage.
 */
export async function createPostgresStore(databaseUrl: string | undefined): Promise<ServerStore | null> {
  if (!hasDatabaseUrl(databaseUrl)) return null;

  let pool: Pool;
  try {
    const { default: pg } = await import('pg');
    pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 3,
      connectionTimeoutMillis: 2000,
    });
  } catch {
    console.warn('[LocalCloud] pg could not be loaded. Falling back to browser storage.');
    return null;
  }

  // Create the table on first run. Safe to call repeatedly.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS localcloud_netlab_snapshot (
        id          TEXT PRIMARY KEY,
        snapshot    JSONB NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  } catch (error) {
    console.warn('[LocalCloud] Could not reach Postgres. The lab will persist to browser storage instead.', error);
    await pool.end().catch(() => undefined);
    return null;
  }

  return {
    async load() {
      try {
        const result = await pool.query<{ snapshot: LabSnapshot }>(
          'SELECT snapshot FROM localcloud_netlab_snapshot WHERE id = $1 LIMIT 1',
          [SNAPSHOT_ID]
        );
        const row = result.rows[0];
        if (!row?.snapshot?.state) return null;
        return row.snapshot.state;
      } catch {
        return null;
      }
    },

    async save(state) {
      try {
        await pool.query(
          `INSERT INTO localcloud_netlab_snapshot (id, snapshot, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = now()`,
          [SNAPSHOT_ID, JSON.stringify(toSnapshot(state))]
        );
      } catch {
        // A failed save must never break the learner's session.
      }
    },

    async clear() {
      try {
        await pool.query('DELETE FROM localcloud_netlab_snapshot WHERE id = $1', [SNAPSHOT_ID]);
      } catch {
        // Ignore: the browser will clear its own copy.
      }
    },
  };
}