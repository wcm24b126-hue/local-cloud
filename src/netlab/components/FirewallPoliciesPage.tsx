/**
 * Firewall policies page (NSGs): rules with direction, priority, protocol, and
 * port ranges, plus target attachment.
 *
 * Rule evaluation semantics match the tracer exactly, which is the point of the
 * lab: a learner can read the same rule list the packet engine reads.
 */

import React, { useState } from 'react';
import { useNetLab } from '../NetLabContext';
import { Button, Callout, Field, StatusBadge, inputClass } from './ui';
import { Column, DataTable, FormPanel } from './tables';
import { Nsg, Rule } from '../../sim/types';
import { isValidCidr } from '../../sim/ip';

const PROTOCOLS = ['tcp', 'udp', 'icmp', 'all'] as const;
const CIDR_PRESETS = ['0.0.0.0/0', '10.0.0.0/8'];

export const FirewallPoliciesPage: React.FC = () => {
  const { state, pending, createNsgResource, addRuleToNsg, removeRuleFromNsg, attachNsgToTargets, detachNsgFromTargets, removeNsg } =
    useNetLab();

  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyName, setPolicyName] = useState('');
  const [policyVpc, setPolicyVpc] = useState('');

  const [ruleFor, setRuleFor] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [direction, setDirection] = useState<'ingress' | 'egress'>('ingress');
  const [action, setAction] = useState<'allow' | 'deny'>('allow');
  const [priority, setPriority] = useState('1000');
  const [protocol, setProtocol] = useState<(typeof PROTOCOLS)[number]>('tcp');
  const [portRange, setPortRange] = useState('');
  const [sourceCidr, setSourceCidr] = useState(CIDR_PRESETS[0]);
  const [description, setDescription] = useState('');

  const [targetFor, setTargetFor] = useState<string | null>(null);
  const [targetVms, setTargetVms] = useState<string[]>([]);
  const [targetSubnets, setTargetSubnets] = useState<string[]>([]);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const isPending = pending.some((p) => p.kind === 'Firewall policy');
  const effectiveVpcId = policyVpc || state.vpcs[0]?.id || '';
  const priorityNumber = Number(priority);
  const priorityValid = Number.isInteger(priorityNumber) && priorityNumber >= 0 && priorityNumber <= 65535;
  const cidrValid = isValidCidr(sourceCidr);

  const targetNsg = state.nsgs.find((n) => n.id === targetFor) ?? null;
  const ruleNsg = state.nsgs.find((n) => n.id === ruleFor) ?? null;

  const createPolicy = async () => {
    const ok = await createNsgResource(policyName, effectiveVpcId);
    if (ok) {
      setPolicyName('');
      setPolicyOpen(false);
    }
  };

  const addRule = async () => {
    if (!ruleFor) return;
    const ok = await addRuleToNsg(ruleFor, {
      name: ruleName,
      direction,
      action,
      priority: priorityNumber,
      protocol,
      portRange: portRange.trim() === '' ? null : portRange.trim(),
      sourceCidr: direction === 'ingress' ? sourceCidr : '0.0.0.0/0',
      destCidr: direction === 'egress' ? sourceCidr : '0.0.0.0/0',
      description,
    });
    if (ok) {
      setRuleName('');
      setPortRange('');
      setDescription('');
      setRuleFor(null);
    }
  };

  const columns: Column<Nsg>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    { key: 'vpc', header: 'VPC network', render: (row) => state.vpcs.find((v) => v.id === row.vpcId)?.name ?? '-' },
    {
      key: 'vms',
      header: 'VM targets',
      numeric: true,
      render: (row) => row.attachedVmIds.length,
    },
    {
      key: 'subnets',
      header: 'Subnet targets',
      numeric: true,
      render: (row) => row.attachedSubnetIds.length,
    },
    {
      key: 'rules',
      header: 'Rules',
      numeric: true,
      render: (row) => row.rules.length,
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'action',
      header: '',
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" onClick={() => setRuleFor(row.id)}>
            Add rule
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setTargetFor(row.id);
              setTargetVms(row.attachedVmIds);
              setTargetSubnets(row.attachedSubnetIds);
            }}
          >
            Targets
          </Button>
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(row.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const ruleColumns: Column<Rule>[] = [
    { key: 'priority', header: 'Priority', numeric: true, render: (row) => row.priority },
    { key: 'direction', header: 'Direction', render: (row) => <span className="capitalize">{row.direction}</span> },
    { key: 'action', header: 'Action', render: (row) => <span className={row.action === 'allow' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>{row.action}</span> },
    { key: 'protocol', header: 'Protocol', render: (row) => <span className="font-mono text-[11px]">{row.protocol}</span> },
    {
      key: 'port',
      header: 'Port range',
      render: (row) => <span className="font-mono text-[11px]">{row.portRange ?? 'all'}</span>,
    },
    {
      key: 'match',
      header: 'Source / destination',
      render: (row) => <span className="font-mono text-[11px] tabular-nums">{row.direction === 'ingress' ? row.sourceCidr : row.destCidr}</span>,
    },
    {
      key: 'desc',
      header: 'Description',
      render: (row) => <span className="text-[var(--text-secondary)]">{row.description || '-'}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Firewall policies</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Rules are evaluated by ascending priority. The first match wins. Anything unmatched hits the implicit
            deny, which is why a packet with no rule is dropped.
          </p>
        </div>
        <Button variant="primary" onClick={() => setPolicyOpen(true)} disabled={state.vpcs.length === 0}>
          Create policy
        </Button>
      </header>

      <DataTable
        columns={columns}
        rows={state.nsgs}
        isPending={isPending}
        pendingLabel="Creating firewall policy…"
        emptyTitle="No firewall policies"
        emptyMessage="Without a policy and rules, every packet is dropped by the implicit deny."
        emptyAction={
          <Button size="sm" variant="primary" onClick={() => setPolicyOpen(true)}>
            Create your first policy
          </Button>
        }
      />

      {state.nsgs.map((nsg) => (
        <section key={nsg.id} className="space-y-2">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            {nsg.name} rules
            <span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">
              applies to {nsg.attachedVmIds.length} VM(s) and {nsg.attachedSubnetIds.length} subnet(s)
            </span>
          </h2>
          <DataTable
            columns={ruleColumns}
            rows={nsg.rules}
            onRowClick={() => undefined}
            emptyTitle="No rules in this policy"
            emptyMessage="Add a rule to allow specific traffic. Without one, all traffic is denied."
            emptyAction={
              <Button size="sm" onClick={() => setRuleFor(nsg.id)}>
                Add a rule
              </Button>
            }
          />
          {nsg.rules.length > 0 ? (
            <div className="flex justify-end">
              <Button size="sm" variant="danger" onClick={() => void removeRuleFromNsg(nsg.id, nsg.rules[nsg.rules.length - 1].id)}>
                Delete last rule ({nsg.rules[nsg.rules.length - 1].name})
              </Button>
            </div>
          ) : null}
        </section>
      ))}

      <FormPanel
        open={policyOpen}
        title="Create firewall policy"
        onClose={() => setPolicyOpen(false)}
        footer={
          <>
            <Button onClick={() => setPolicyOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void createPolicy()} disabled={policyName.trim().length === 0 || !effectiveVpcId}>
              Create
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="nsg-name">
          <input id="nsg-name" className={inputClass} value={policyName} onChange={(e) => setPolicyName(e.target.value)} placeholder="allow-web" />
        </Field>
        <Field label="VPC network" htmlFor="nsg-vpc">
          <select id="nsg-vpc" className={inputClass} value={effectiveVpcId} onChange={(e) => setPolicyVpc(e.target.value)}>
            {state.vpcs.map((vpc) => (
              <option key={vpc.id} value={vpc.id}>
                {vpc.name}
              </option>
            ))}
          </select>
        </Field>
      </FormPanel>

      <FormPanel
        open={ruleFor !== null}
        title={ruleNsg ? `Add rule to ${ruleNsg.name}` : 'Add rule'}
        description="Lower priority numbers are evaluated first. 65535 is reserved for the implicit deny."
        onClose={() => setRuleFor(null)}
        footer={
          <>
            <Button onClick={() => setRuleFor(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => void addRule()}
              disabled={ruleName.trim().length === 0 || !priorityValid || !cidrValid}
            >
              Add rule
            </Button>
          </>
        }
      >
        <Field label="Rule name" htmlFor="rule-name">
          <input id="rule-name" className={inputClass} value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="allow-http-from-anywhere" />
        </Field>
        <Field label="Direction" htmlFor="rule-direction">
          <select id="rule-direction" className={inputClass} value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
            <option value="ingress">Ingress (inbound)</option>
            <option value="egress">Egress (outbound)</option>
          </select>
        </Field>
        <Field label="Action" htmlFor="rule-action">
          <select id="rule-action" className={inputClass} value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
        </Field>
        <Field
          label="Priority"
          hint="0 is evaluated first. 0-65534 are valid rule priorities."
          error={!priorityValid ? 'Enter a whole number from 0 to 65534.' : undefined}
          htmlFor="rule-priority"
        >
          <input id="rule-priority" className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Protocol" htmlFor="rule-protocol">
          <select id="rule-protocol" className={inputClass} value={protocol} onChange={(e) => setProtocol(e.target.value as typeof protocol)}>
            {PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Port range" hint='Single port "80", inclusive range "8000-8100", or leave empty for all ports.' htmlFor="rule-port">
          <input id="rule-port" className={inputClass} value={portRange} onChange={(e) => setPortRange(e.target.value)} placeholder="80" disabled={protocol === 'icmp' || protocol === 'all'} />
        </Field>
        <Field
          label={direction === 'ingress' ? 'Source IPv4 range' : 'Destination IPv4 range'}
          hint={cidrValid ? 'Valid CIDR.' : 'Enter a valid IPv4 CIDR block.'}
          htmlFor="rule-cidr"
        >
          <input id="rule-cidr" className={inputClass} value={sourceCidr} onChange={(e) => setSourceCidr(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {CIDR_PRESETS.map((preset) => (
            <Button key={preset} size="sm" onClick={() => setSourceCidr(preset)}>
              {preset}
            </Button>
          ))}
        </div>
        <Field label="Description" htmlFor="rule-desc">
          <input id="rule-desc" className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </FormPanel>

      <FormPanel
        open={targetFor !== null}
        title={targetNsg ? `Targets for ${targetNsg.name}` : 'Targets'}
        description="Target changes apply immediately. The tracer reads the same attachment lists."
        onClose={() => setTargetFor(null)}
        footer={
          <>
            <Button onClick={() => setTargetFor(null)}>Close</Button>
            {targetFor ? (
              <>
                <Button
                  onClick={() => {
                    void detachNsgFromTargets(targetFor, { vmIds: targetVms, subnetIds: targetSubnets });
                    setTargetVms([]);
                    setTargetSubnets([]);
                  }}
                >
                  Detach selected
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    void attachNsgToTargets(targetFor, { vmIds: targetVms, subnetIds: targetSubnets });
                    setTargetFor(null);
                  }}
                >
                  Attach selected
                </Button>
              </>
            ) : null}
          </>
        }
      >
        <Field label="VM instances">
          {state.vms.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">No VMs yet.</p>
          ) : (
            <div className="space-y-1">
              {state.vms.map((vm) => (
                <label key={vm.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={targetVms.includes(vm.id)}
                    onChange={() =>
                      setTargetVms((prev) => (prev.includes(vm.id) ? prev.filter((v) => v !== vm.id) : [...prev, vm.id]))
                    }
                  />
                  <span className="font-mono">{vm.name}</span>
                </label>
              ))}
            </div>
          )}
        </Field>
        <Field label="Subnetworks">
          {state.subnets.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">No subnets yet.</p>
          ) : (
            <div className="space-y-1">
              {state.subnets.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={targetSubnets.includes(s.id)}
                    onChange={() =>
                      setTargetSubnets((prev) => (prev.includes(s.id) ? prev.filter((v) => v !== s.id) : [...prev, s.id]))
                    }
                  />
                  <span className="font-mono">{s.name}</span>
                  <span className="font-mono text-[var(--text-muted)]">{s.cidr}</span>
                </label>
              ))}
            </div>
          )}
        </Field>
      </FormPanel>

      <FormPanel
        open={confirmDelete !== null}
        title="Delete firewall policy"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) void removeNsg(confirmDelete, false);
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <Callout tone="error" title="Traffic may stop flowing">
          Deleting a policy removes its rules. Any traffic that relied on those rules hits the implicit deny and gets
          dropped.
        </Callout>
      </FormPanel>
    </div>
  );
};