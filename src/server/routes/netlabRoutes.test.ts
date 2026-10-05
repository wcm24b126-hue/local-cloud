/**
 * Lab persistence route tests.
 *
 * Boots the router in-process on an ephemeral port so the real HTTP contract is
 * exercised: the browser client depends on the `backend` field to decide whether
 * to mirror anything, and a 404/503 must be distinguishable from a working
 * route.
 */

import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNetlabRouter } from './netlabRoutes';
import { buildSampleNetwork } from '../../sim/seed';

let server: Server;
let baseUrl: string;

async function start(): Promise<Server> {
  const { router } = await createNetlabRouter();
  const app = express();
  app.use(express.json());
  app.use('/api/netlab', router);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return new Promise<Server>((resolve) => {
    const created = app.listen(0, '127.0.0.1', () => resolve(created));
  });
}

beforeAll(async () => {
  // No DATABASE_URL in the test environment, so this is the zero-setup path.
  delete process.env.DATABASE_URL;
  server = await start();
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server?.close();
});

describe('GET /api/netlab/state without DATABASE_URL', () => {
  it('reports the localStorage backend so the client does not mirror', async () => {
    const response = await fetch(`${baseUrl}/api/netlab/state`);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { backend: string; snapshot: unknown };
    expect(payload.backend).toBe('localStorage');
    expect(payload.snapshot).toBeNull();
  });
});

describe('PUT /api/netlab/state without DATABASE_URL', () => {
  it('answers 503 with an explanation instead of pretending to save', async () => {
    const response = await fetch(`${baseUrl}/api/netlab/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: buildSampleNetwork() }),
    });

    expect(response.status).toBe(503);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain('browser storage');
  });

  it('rejects a malformed body with 400', async () => {
    const response = await fetch(`${baseUrl}/api/netlab/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notState: true }),
    });
    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/netlab/state without DATABASE_URL', () => {
  it('succeeds as a no-op so the client can always clear locally', async () => {
    const response = await fetch(`${baseUrl}/api/netlab/state`, { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { backend: string }).backend).toBe('localStorage');
  });
});

describe('unknown API routes', () => {
  it('404 as JSON rather than falling through to the SPA', async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
  });
});