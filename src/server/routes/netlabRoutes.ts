/**
 * Lab state persistence route.
 *
 * Always mounted, so the browser can ask which persistence backend is active
 * with a real JSON response instead of guessing. When DATABASE_URL is set and
 * Postgres answers, the state is stored as a single JSONB row; otherwise the
 * route reports "localStorage" and stores nothing, which is the zero-setup
 * default.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createPostgresStore, hasDatabaseUrl, ServerStore } from '../netlabStore';
import { LabSnapshot } from '../../netlab/persistence/types';

export type PersistenceBackend = 'postgres' | 'localStorage';

export async function createNetlabRouter(): Promise<{ router: Router; backend: PersistenceBackend }> {
  let store: ServerStore | null = null;

  if (hasDatabaseUrl(process.env.DATABASE_URL)) {
    store = await createPostgresStore(process.env.DATABASE_URL);
    if (!store) {
      console.warn(
        '[LocalCloud] DATABASE_URL is set but Postgres is unreachable. Lab state will stay in browser storage.'
      );
    }
  }

  const backend: PersistenceBackend = store ? 'postgres' : 'localStorage';
  const router = Router();

  /**
   * GET returns the backend name alongside the snapshot. The client uses the
   * backend name to decide whether to mirror anything, which is more reliable
   * than inferring it from the HTTP status.
   */
  router.get('/state', async (_req: Request, res: Response) => {
    if (!store) {
      res.json({ backend, snapshot: null });
      return;
    }

    const state = await store.load();
    const snapshot: LabSnapshot | null = state
      ? { version: 1, savedAt: new Date().toISOString(), state }
      : null;
    res.json({ backend, snapshot });
  });

  router.put('/state', async (req: Request, res: Response) => {
    // Validate the payload first so a malformed request always reports 400,
    // regardless of which backend happens to be configured.
    const state = req.body?.state;
    if (!state || typeof state !== 'object') {
      res.status(400).json({ error: 'Expected a JSON body with a "state" object.' });
      return;
    }

    if (!store) {
      res.status(503).json({ error: 'Server-side persistence is not configured. State stays in browser storage.' });
      return;
    }

    await store.save(state);
    res.json({ ok: true, backend });
  });

  router.delete('/state', async (_req: Request, res: Response) => {
    if (store) await store.clear();
    res.json({ ok: true, backend });
  });

  return { router, backend };
}