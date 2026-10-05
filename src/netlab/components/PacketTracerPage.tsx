/**
 * Packet tracer page: pick a source, destination, protocol and port, send the
 * packet through the pure engine, and read the hop-by-hop result.
 *
 * This is the centrepiece of the lab, so the presentation is deliberately
 * explicit: verdict first, then every hop with the rule or route that decided it.
 */

import React, { useMemo, useState } from 'react';
import { useNetLab } from '../NetLabContext';
import { Button, Callout, Card, Field, StatusBadge, inputClass } from './ui';
import { TraceDecision, TraceHop } from '../../sim/types';
import { isValidIpv4 } from '../../sim/ip';
import { EXTERNAL_CLIENT } from '../../sim/seed';

const PROTOCOLS = ['tcp', 'udp', 'icmp'] as const;

/** An endpoint is either EXTERNAL_CLIENT or the name of a sample-network resource. */
type PresetEndpoint = string;

interface Preset {
  label: string;
  source: PresetEndpoint;
  dest: PresetEndpoint;
  protocol: 'tcp' | 'udp' | 'icmp';
  destPort: string;
}

const decisionColor: Record<TraceDecision, string> = {
  PASS: 'text-[var(--success)]',
  DROP: 'text-[var(--danger)]',
  INFO: 'text-[var(--text-secondary)]',
};

const componentIcon: Record<TraceHop['component'], string> = {
  source: 'SRC',
  subnet: 'NET',
  'route-table': 'RTE',
  'internet-gateway': 'IGW',
  'load-balancer': 'LB',
  'nsg-egress': 'FW',
  'nsg-ingress': 'FW',
  vm: 'VM',
  destination: 'DST',
};

export const PacketTracerPage: React.FC = () => {
  const { state, isTracing, currentTrace, sendPacket, clearTraces } = useNetLab();

  // A flat list of every addressable endpoint, which is what the form needs.
  const endpoints = useMemo(
    () => [
      ...state.vms.flatMap((vm) => [
        { ip: vm.internalIp, label: `${vm.name} (internal)`, id: vm.id },
        ...(vm.externalIp ? [{ ip: vm.externalIp, label: `${vm.name} (external)`, id: vm.id }] : []),
      ]),
      ...state.loadBalancers.map((lb) => ({ ip: lb.frontendIp, label: `${lb.name} (load balancer)`, id: lb.id })),
      ...state.subnets.map((s) => ({ ip: s.gatewayIp, label: `${s.name} (gateway)`, id: s.id })),
      { ip: '8.8.8.8', label: '8.8.8.8 (internet)', id: 'internet' },
      { ip: '203.0.113.10', label: '203.0.113.10 (internet)', id: 'internet2' },
    ],
    [state.vms, state.loadBalancers, state.subnets]
  );

  const [sourceIp, setSourceIp] = useState('');
  const [destIp, setDestIp] = useState('');
  const [protocol, setProtocol] = useState<(typeof PROTOCOLS)[number]>('tcp');
  const [destPort, setDestPort] = useState('80');
  const [customSource, setCustomSource] = useState('');

  const effectiveSource = sourceIp || customSource;
  const port = Number(destPort);
  const portValid = protocol === 'icmp' || (Number.isInteger(port) && port >= 1 && port <= 65535);
  const sourceValid = isValidIpv4(effectiveSource);
  const destValid = isValidIpv4(destIp);

  // These four presets mirror EXPECTED_TRACES in src/sim/seed.ts and the guided
  // lab, so all three describe the same packets.
  const presets: Preset[] = [
    { label: 'Internet \u2192 Load balancer (allowed)', source: EXTERNAL_CLIENT, dest: 'web-lb', protocol: 'tcp', destPort: '80' },
    { label: 'Internet \u2192 VM port 22 (blocked)', source: EXTERNAL_CLIENT, dest: 'web-1', protocol: 'tcp', destPort: '22' },
    { label: 'App \u2192 Database (allowed)', source: 'app-1', dest: 'db-1', protocol: 'tcp', destPort: '5432' },
    { label: 'Web \u2192 Database (blocked)', source: 'web-1', dest: 'db-1', protocol: 'tcp', destPort: '5432' },
  ];

  const applyPreset = (preset: Preset) => {
    setProtocol(preset.protocol);
    setDestPort(preset.destPort);

    // Resolve endpoints by name so presets work on a freshly seeded lab.
    const resolve = (needle: string) => {
      if (needle === EXTERNAL_CLIENT) return EXTERNAL_CLIENT;
      const vm = state.vms.find((v) => v.name === needle);
      if (vm) return vm.internalIp;
      const lb = state.loadBalancers.find((l) => l.name === needle);
      return lb?.frontendIp ?? '';
    };

    const source = resolve(preset.source);
    setSourceIp(preset.source === EXTERNAL_CLIENT ? '' : source);
    setCustomSource(preset.source === EXTERNAL_CLIENT ? EXTERNAL_CLIENT : '');
    setDestIp(resolve(preset.dest));
  };

  const submit = async () => {
    await sendPacket({
      sourceIp: effectiveSource,
      destIp,
      protocol,
      destPort: protocol === 'icmp' ? undefined : port,
      sourcePort: protocol === 'icmp' ? undefined : 40000,
    });
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-medium text-[var(--text-primary)]">Packet tracer</h1>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Trace a packet through egress firewall, route table, internet gateway, load balancer, and ingress firewall.
          Every hop shows the exact rule that allowed or dropped it.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <Card title="Compose packet">
          <div className="space-y-3">
            <Field label="Source endpoint" hint="Pick a known endpoint or type any IPv4 address." htmlFor="trace-source">
              <select id="trace-source" className={inputClass} value={sourceIp} onChange={(e) => setSourceIp(e.target.value)}>
                <option value="">Custom address…</option>
                {endpoints.map((e) => (
                  <option key={`${e.id}-${e.ip}`} value={e.ip}>
                    {e.label}
                  </option>
                ))}
              </select>
            </Field>

            {sourceIp === '' ? (
              <Field
                label="Source IP address"
                error={customSource && !sourceValid ? 'Not a valid IPv4 address.' : undefined}
                htmlFor="trace-source-custom"
              >
                <input
                  id="trace-source-custom"
                  className={inputClass}
                  value={customSource}
                  onChange={(e) => setCustomSource(e.target.value)}
                  placeholder="203.0.113.10"
                />
              </Field>
            ) : null}

            <Field label="Destination endpoint" htmlFor="trace-dest">
              <select id="trace-dest" className={inputClass} value={destIp} onChange={(e) => setDestIp(e.target.value)}>
                <option value="">Select…</option>
                {endpoints.map((e) => (
                  <option key={`${e.id}-${e.ip}`} value={e.ip}>
                    {e.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Destination IP address" hint="Destination must match a VM internal IP, a load balancer frontend, or an external address." htmlFor="trace-dest-custom">
              <input
                id="trace-dest-custom"
                className={inputClass}
                value={destIp}
                onChange={(e) => setDestIp(e.target.value)}
                placeholder="10.0.2.10"
              />
            </Field>

            <Field label="Protocol" htmlFor="trace-protocol">
              <select id="trace-protocol" className={inputClass} value={protocol} onChange={(e) => setProtocol(e.target.value as typeof protocol)}>
                {PROTOCOLS.map((p) => (
                  <option key={p} value={p}>
                    {p.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>

            {protocol !== 'icmp' ? (
              <Field
                label="Destination port"
                error={!portValid ? 'Enter a port from 1 to 65535.' : undefined}
                htmlFor="trace-port"
              >
                <input id="trace-port" className={inputClass} value={destPort} onChange={(e) => setDestPort(e.target.value)} inputMode="numeric" />
              </Field>
            ) : null}

            <Button
              variant="primary"
              className="w-full"
              onClick={() => void submit()}
              disabled={isTracing || !sourceValid || !destValid || !portValid}
            >
              {isTracing ? 'Tracing…' : 'Trace packet'}
            </Button>

            <div className="space-y-1.5 border-t border-[var(--border-subtle)] pt-3">
              <p className="text-xs font-medium text-[var(--text-secondary)]">Presets</p>
              {presets.map((preset) => (
                <Button key={preset.label} size="sm" className="w-full justify-start" onClick={() => applyPreset(preset)}>
                  {preset.label}
                </Button>
              ))}
              <p className="text-[11px] text-[var(--text-muted)]">
                Presets expect the sample network. Load the sample first on the VPC networks page.
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          {currentTrace ? (
            <Card
              title={`Result · ${currentTrace.result.verdict === 'ALLOWED' ? 'ALLOWED' : 'BLOCKED'}`}
              action={
                <span className={`font-mono text-xs ${decisionColor[currentTrace.result.verdict === 'ALLOWED' ? 'PASS' : 'DROP']}`}>
                  {currentTrace.packet.protocol.toUpperCase()}
                  {currentTrace.packet.destPort ? `:${currentTrace.packet.destPort}` : ''}
                </span>
              }
            >
              <div className="space-y-3">
                <p className="font-mono text-xs text-[var(--text-secondary)]">
                  {currentTrace.packet.sourceIp} → {currentTrace.packet.destIp}
                  {currentTrace.packet.sourcePort ? `:${currentTrace.packet.sourcePort}` : ''}
                </p>
                <p className="text-sm text-[var(--text-primary)]">{currentTrace.result.summary}</p>

                {currentTrace.result.verdict === 'BLOCKED' ? (
                  <Callout tone="error" title="How to fix it">
                    {lastDropFix(currentTrace.result.hops) ?? 'Check the firewall rules on the destination resource.'}
                  </Callout>
                ) : null}

                <ol className="space-y-1.5">
                  {currentTrace.result.hops.map((hop) => (
                    <li
                      key={`${hop.order}-${hop.component}-${hop.label}`}
                      className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] px-3 py-2"
                    >
                      <span className="mt-0.5 w-6 shrink-0 text-center font-mono text-[10px] text-[var(--text-muted)]">
                        {hop.order}
                      </span>
                      <span className="mt-0.5 w-9 shrink-0 rounded bg-[var(--bg-canvas)] px-1 py-0.5 text-center font-mono text-[9px] text-[var(--text-secondary)]">
                        {componentIcon[hop.component]}
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-xs font-medium text-[var(--text-primary)]">{hop.label}</span>
                          <span className={`font-mono text-[10px] font-medium ${decisionColor[hop.decision]}`}>{hop.decision}</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)]">{hop.reason}</p>
                        {hop.matchedRuleId ? (
                          <p className="font-mono text-[10px] text-[var(--text-muted)]">rule {hop.matchedRuleId}</p>
                        ) : null}
                        {hop.fix && hop.decision === 'DROP' ? (
                          <p className="text-[11px] text-[var(--warning)]">Fix: {hop.fix}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </Card>
          ) : (
            <Card title="Result">
              <p className="text-xs text-[var(--text-secondary)]">
                Compose a packet and press Trace. Nothing is sent anywhere: this is a pure function over your simulated
                network state.
              </p>
            </Card>
          )}

          <Card
            title={`Trace history (${state.traces.length})`}
            action={
              state.traces.length > 0 ? (
                <Button size="sm" onClick={clearTraces}>
                  Clear
                </Button>
              ) : null
            }
          >
            {state.traces.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)]">No packets traced yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {state.traces.map((trace) => (
                  <li key={trace.id} className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-1.5 last:border-0">
                    <span className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                      {trace.packet.sourceIp} → {trace.packet.destIp}
                      {trace.packet.destPort ? `:${trace.packet.destPort}` : ''}
                    </span>
                    <StatusBadge status={trace.result.verdict === 'ALLOWED' ? 'RUNNING' : 'TERMINATED'} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

function lastDropFix(hops: TraceHop[]): string | undefined {
  return [...hops].reverse().find((hop) => hop.decision === 'DROP')?.fix;
}