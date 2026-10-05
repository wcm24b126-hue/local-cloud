/**
 * Browser-side adapter for the server's Postgres-backed lab storage.
 *
 * The browser never sees DATABASE_URL. It calls the same-origin
 * `/api/netlab/state` route, which reports which backend is active. When the
 * backend is localStorage the adapter does nothing at all, so the lab keeps
 * working with zero configuration.
 */

import { SimState } from '../../sim/types';
import { PersistenceAdapter } from './types';

const STATE_URL = '/api/netlab/state';

interface StateResponse {
  backend?: 'postgres' | 'localStorage';
  snapshot?: { version: number; savedAt: string; state: SimState } | null;
}

export class HttpAdapter implements PersistenceAdapter {
  readonly name = 'postgres';

  /** Set once the endpoint proves unusable, so we stop retrying every save. */
  private available = true;

  private async request(method: 'GET' | 'PUT' | 'DELETE', body?: string): Promise<Response | null> {
    if (!this.available) return null;

    try {
      const response = await fetch(STATE_URL, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      });

      // A 404 or 501 means this server has no lab persistence route at all.
      if (response.status === 404 || response.status === 501) {
        this.available = false;
        return null;
      }
      if (!response.ok) return null;

      return response;
    } catch {
      this.available = false;
      return null;
    }
  }

  /** Ask the server which backend it is using. Null when unreachable. */
  async probe(): Promise<'postgres' | 'localStorage' | null> {
    const response = await this.request('GET');
    if (!response) return null;

    try {
      const payload = (await response.json()) as StateResponse;
      return payload.backend ?? null;
    } catch {
      return null;
    }
  }

  async load(): Promise<SimState | null> {
    const response = await this.request('GET');
    if (!response) return null;

    try {
      const payload = (await response.json()) as StateResponse;
      return payload.snapshot?.state ?? null;
    } catch {
      return null;
    }
  }

  async save(state: SimState): Promise<void> {
    await this.request('PUT', JSON.stringify({ state }));
  }

  async clear(): Promise<void> {
    await this.request('DELETE');
  }
}