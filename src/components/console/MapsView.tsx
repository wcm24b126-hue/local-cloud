import React, { useState } from 'react';
import { Map as MapIcon, KeyRound, Globe2 } from 'lucide-react';
import { useNetLab } from '../../netlab/NetLabContext';
import { Card, Button, Callout, StatusBadge, MetaRow } from '../../netlab/components/ui';
import { DataTable, type Column } from '../../netlab/components/tables';

type Tab = 'apis' | 'credentials';

/**
 * Maps Platform. Real Maps needs a billing-enabled project and returns live
 * tiles, which this offline emulator cannot do. The API and credential tables
 * are still modelled so the integration shape is learnable.
 */
export const MapsView: React.FC<{ tab?: Tab }> = ({ tab: initialTab = 'apis' }) => {
  const { state } = useNetLab();
  const [tab, setTab] = useState<Tab>(initialTab);

  const apis: { id: string; name: string; service: string; status: string; quota: string }[] = [
    { id: 'maps-geocoding', name: 'Geocoding API', service: 'Geocoding', status: 'ENABLED', quota: 'unlimited' },
    { id: 'maps-routes', name: 'Routes API', service: 'Directions', status: 'ENABLED', quota: 'unlimited' },
    { id: 'maps-places', name: 'Places API', service: 'Places', status: 'DISABLED', quota: 'unlimited' },
    { id: 'maps-static', name: 'Maps Static API', service: 'Static maps', status: 'DISABLED', quota: 'unlimited' },
  ];
  const apiColumns: Column<(typeof apis)[number]>[] = [
    { key: 'name', header: 'API', render: (a) => a.name },
    { key: 'service', header: 'Service', render: (a) => a.service },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
    { key: 'quota', header: 'Quota', render: (a) => a.quota },
    { key: 'name', header: 'API', render: (a) => a.name },
  ];

  const credentials = [
    { id: 'maps-key-browser', name: 'Maps Browser key', key: 'AIza...local-sim', restriction: 'HTTP referrers', status: 'ACTIVE' },
    { id: 'maps-key-server', name: 'Maps Server key', key: 'AIza...local-sim', restriction: 'IP addresses', status: 'ACTIVE' },
    { id: 'maps-id', name: 'Maps Platform account', key: 'localcloud-maps-sim', restriction: 'none', status: 'ACTIVE' },
  ];
  const credentialColumns: Column<(typeof credentials)[number]>[] = [
    { key: 'name', header: 'Name', render: (c) => c.name },
    { key: 'key', header: 'Key', render: (c) => <span className="font-mono text-[11px]">{c.key}</span> },
    { key: 'restriction', header: 'Restrictions', render: (c) => c.restriction },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
  ];

  const TABS: { id: Tab; label: string }[] = [
    { id: 'apis', label: 'APIs' },
    { id: 'credentials', label: 'Credentials' },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-medium text-[var(--text-primary)]">
          <MapIcon size={18} /> Maps Platform
        </h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          API and credential management. Map tiles themselves are not simulated, because there is no map data offline.
        </p>
      </header>

      <Callout tone="info" title="Why there is no map canvas">
        Rendering Maps needs either live tiles or a bundled offline map, and this emulator has neither. The billing and
        key-restriction model below is still real, so the integration shape carries over.
      </Callout>

      <div className="flex gap-1 border-b border-[var(--border-subtle)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-xs font-medium ${
              tab === t.id
                ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'apis' ? (
        <Card title="Maps APIs" action={<Button size="sm"><Globe2 size={12} /> Enable API</Button>}>
          <DataTable columns={apiColumns} rows={apis} emptyTitle="No APIs enabled" emptyMessage="Enable an API to start using Maps in an application." />
        </Card>
      ) : null}

      {tab === 'credentials' ? (
        <Card title="Credentials" action={<Button size="sm"><KeyRound size={12} /> Create key</Button>}>
          <DataTable columns={credentialColumns} rows={credentials} emptyTitle="No credentials" emptyMessage="Create an API key to authenticate requests." />
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1">
            <MetaRow label="Restricted keys" value={String(credentials.filter((c) => c.restriction !== 'none').length)} />
            <MetaRow label="VPCs in project" value={String(state.vpcs.length)} />
          </div>
        </Card>
      ) : null}
    </div>
  );
};

export const MapsApisTab: React.FC = () => <MapsView tab="apis" />;
export const MapsCredentialsTab: React.FC = () => <MapsView tab="credentials" />;