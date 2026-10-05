/**
 * Simulated gcloud commands for the networking lab.
 *
 * Pure functions over SimState: no I/O, no React. The Cloud Shell calls these so
 * the learner can inspect and manipulate the same simulated network the UI
 * shows, and the commands stay unit-testable.
 *
 * Nothing here executes anything. `gcloud compute ssh` is deliberately not
 * implemented: this emulator never opens a real shell.
 */

import {
  createInitialState,
  createSubnet,
  createVm,
  createVpc,
  deleteSubnet,
  deleteVm,
  deleteVpc,
  setVmRunning,
} from './engine';
import { isValidCidr, usableRange } from './ip';
import { buildRouteTable, evaluatePacket, selectRoute } from './packetTracer';
import { buildSampleNetwork, verifyDemoTraces } from './seed';
import { SimResult, SimState } from './types';

/** A request from the shell for the store to run a packet trace. */
export interface TraceRequest {
  sourceIp: string;
  destIp: string;
  destPort?: number;
}

export interface CliResult {
  /** Lines to print. */
  lines: string[];
  /** Set when the command needs the store to commit a mutation. */
  apply?: (current: SimState) => Promise<SimState> | SimState;
  /** Set when the command wants the packet tracer to run. */
  trace?: TraceRequest;
}

/** Commands the lab contributes to the Cloud Shell help output. */
export const NETLAB_HELP_LINES = [
  '  gcloud compute networks list                     - List simulated VPC networks',
  '  gcloud compute networks subnets list             - List simulated subnetworks',
  '  gcloud compute instances list                    - List simulated VM instances',
  '  gcloud compute instances describe <NAME>         - Show one simulated VM in detail',
  '  gcloud compute routers list                      - List simulated routes',
  '  gcloud compute forwarding-rules list             - List simulated load balancers',
  '  gcloud compute firewall-rules list               - List simulated firewall rules',
  '  gcloud compute firewall-rules describe <POLICY>   - Show one firewall policy with its rules',
  '  gcloud compute networks topologies export [VPC]  - Print the network as a text tree',
  '  gcloud compute networks create <NAME>            - Create a simulated VPC network',
  '  gcloud compute networks delete <NAME>            - Delete a simulated VPC network',
  '  gcloud compute networks subnets create <NAME> --range=<CIDR> --vpc=<VPC>',
  '  gcloud compute networks subnets delete <NAME>',
  '  gcloud compute instances create <NAME> --subnet=<SUBNET> [--external-ip]',
  '  gcloud compute instances delete <NAME>',
  '  gcloud compute instances start|stop <NAME>',
  '  lc lab sample                                    - Load the sample network',
  '  lc lab reset                                     - Remove every simulated resource',
  '  lc lab topology                                  - Print the network as text',
  '  lc lab route <IP>                                - Show which route an IP would take',
  '  lc lab trace <SRC_IP> <DST_IP> [PORT]             - Trace a packet through the lab',
  '  lc lab verify-traces                             - Check the four demo traces against expectations',
];

const NOT_SUPPORTED =
  'ERROR: This emulator is simulation-only. Container execution and SSH sessions are intentionally not implemented.';

function pad(value: string, width: number): string {
  return value.length >= width ? `${value} ` : value.padEnd(width);
}

function parseFlag(parts: string[], flag: string): string | undefined {
  const withEquals = parts.find((p) => p.startsWith(`${flag}=`));
  if (withEquals) return withEquals.slice(flag.length + 1);
  const index = parts.indexOf(flag);
  if (index >= 0 && parts[index + 1] && !parts[index + 1].startsWith('-')) return parts[index + 1];
  return undefined;
}

function hasFlag(parts: string[], flag: string): boolean {
  return parts.includes(flag) || parts.some((p) => p.startsWith(`${flag}=`));
}

/** CIDR prefix length, or 0 when the string is not a CIDR. Used for longest-prefix matching. */
/** Usable host addresses in a CIDR, i.e. excluding network, gateway and broadcast. */
function usableCount(cidr: string): number {
  const range = usableRange(cidr);
  return range ? range.last - range.first + 1 : 0;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Unwrap an engine result, or turn its error into printed lines. */
function fromEngine(result: SimResult<{ state: SimState }>, successMessage: string): CliResult {
  if (!result.ok) {
    return { lines: [`ERROR: ${result.message}`, `HINT: ${result.howToFix}`] };
  }
  return { lines: [successMessage], apply: () => result.value.state };
}

/**
 * Run one lab command. Returns null when the command is not a lab command, so
 * the caller can fall through to its own command table.
 */
export function runNetlabCommand(state: SimState, command: string): CliResult | null {
  const trimmed = command.trim();
  if (trimmed.length === 0) return null;
  const parts = trimmed.split(/\s+/);

  /* ------------------------------- read-only ------------------------------ */

  if (trimmed === 'gcloud compute networks list') {
    if (state.vpcs.length === 0) return { lines: ['Listed 0 items.'] };
    return {
      lines: [
        `${pad('NAME', 22)}${pad('MODE', 12)}${pad('ROUTING_MODE', 14)}${pad('STATUS', 10)}SUBNETS`,
        ...state.vpcs.map((vpc) => {
          const subnets = state.subnets.filter((s) => s.vpcId === vpc.id);
          const nets = subnets.length ? subnets.map((s) => s.cidr).join(', ') : '-';
          return `${pad(vpc.name, 22)}${pad(vpc.mode, 12)}${pad(vpc.routingMode, 14)}${pad(vpc.status, 10)}${nets}`;
        }),
        '',
        `Listed ${plural(state.vpcs.length, 'item')}.`,
      ],
    };
  }

  if (trimmed === 'gcloud compute networks subnets list') {
    if (state.subnets.length === 0) return { lines: ['Listed 0 items.'] };
    return {
      lines: [
        `${pad('NAME', 20)}${pad('NETWORK', 18)}${pad('REGION', 14)}${pad('RANGE', 18)}${pad('GATEWAY', 15)}IN_USE`,
        ...state.subnets.map((subnet) => {
          const vpc = state.vpcs.find((v) => v.id === subnet.vpcId);
          return `${pad(subnet.name, 20)}${pad(vpc?.name ?? '-', 18)}${pad(subnet.region, 14)}${pad(subnet.cidr, 18)}${pad(subnet.gatewayIp, 15)}${subnet.usedIps.length}/${usableCount(subnet.cidr)}`;
        }),
        '',
        `Listed ${plural(state.subnets.length, 'item')}.`,
      ],
    };
  }

  if (trimmed === 'gcloud compute instances list') {
    if (state.vms.length === 0) return { lines: ['Listed 0 items.'] };
    return {
      lines: [
        `${pad('NAME', 18)}${pad('ZONE', 16)}${pad('MACHINE_TYPE', 16)}${pad('INTERNAL_IP', 15)}${pad('EXTERNAL_IP', 15)}STATUS`,
        ...state.vms.map((vm) =>
          `${pad(vm.name, 18)}${pad(vm.zone, 16)}${pad(vm.machineType, 16)}${pad(vm.internalIp, 15)}${pad(vm.externalIp ?? '-', 15)}${vm.status}`
        ),
        '',
        `Listed ${plural(state.vms.length, 'item')}.`,
      ],
    };
  }

  if (trimmed === 'gcloud compute routers list') {
    // Reuse the packet engine's route table so the CLI shows the same implicit
    // local routes the tracer actually uses.
    const allRoutes = state.vpcs.flatMap((vpc) => buildRouteTable(state, vpc.id));
    if (allRoutes.length === 0) return { lines: ['Listed 0 routes.'] };
    return {
      lines: [
        `${pad('NAME', 22)}${pad('NETWORK', 18)}${pad('DEST_RANGE', 18)}NEXT_HOP`,
        ...allRoutes.map((route) => {
          const vpc = state.vpcs.find((v) => v.id === route.vpcId);
          return `${pad(route.name, 22)}${pad(vpc?.name ?? '-', 18)}${pad(route.destCidr, 18)}${route.nextHop}`;
        }),
        '',
        `Listed ${plural(allRoutes.length, 'route')}.`,
      ],
    };
  }

  if (trimmed === 'gcloud compute forwarding-rules list') {
    if (state.loadBalancers.length === 0) return { lines: ['Listed 0 items.'] };
    return {
      lines: [
        `${pad('NAME', 20)}${pad('IP_ADDRESS', 16)}${pad('PORT', 8)}${pad('TYPE', 16)}BACKENDS`,
        ...state.loadBalancers.map((lb) => {
          const backends =
            lb.backendVmIds.map((id) => state.vms.find((v) => v.id === id)?.name ?? '?').join(',') || '-';
          return `${pad(lb.name, 20)}${pad(lb.frontendIp, 16)}${pad(String(lb.port), 8)}${pad(lb.type, 16)}${backends}`;
        }),
        '',
        `Listed ${plural(state.loadBalancers.length, 'item')}.`,
      ],
    };
  }

  if (trimmed === 'gcloud compute firewall-rules list') {
    const rules = state.nsgs.flatMap((nsg) => nsg.rules.map((rule) => ({ nsg, rule })));
    if (rules.length === 0) return { lines: ['Listed 0 items.'] };
    return {
      lines: [
        `${pad('POLICY', 18)}${pad('NAME', 26)}${pad('DIRECTION', 11)}${pad('PRIORITY', 10)}${pad('PROTOCOL', 10)}${pad('PORT', 10)}RANGE`,
        ...rules.map(({ nsg, rule }) =>
          `${pad(nsg.name, 18)}${pad(rule.name, 26)}${pad(rule.direction, 11)}${pad(String(rule.priority), 10)}${pad(rule.protocol, 10)}${pad(rule.portRange ?? 'all', 10)}${rule.direction === 'ingress' ? rule.sourceCidr : rule.destCidr}`
        ),
        '',
        `Listed ${plural(rules.length, 'rule')}.`,
      ],
    };
  }

  // The gcloud-shaped alias for `lc lab topology`.
  if (
    parts[0] === 'gcloud' &&
    parts[1] === 'compute' &&
    parts[2] === 'networks' &&
    parts[3] === 'topologies' &&
    parts[4] === 'export'
  ) {
    return runLcLabCommand(state, ['lc', 'lab', 'topology']);
  }

  if (
    parts[0] === 'gcloud' &&
    parts[1] === 'compute' &&
    parts[2] === 'firewall-rules' &&
    parts[3] === 'describe'
  ) {
    const name = parts[4];
    const nsg = state.nsgs.find((n) => n.name === name);
    if (!nsg) return { lines: [`ERROR: Policy [${name ?? ''}] not found.`] };

    const targets = [
      ...nsg.attachedSubnetIds.map((id) => state.subnets.find((s) => s.id === id)?.name ?? id),
      ...nsg.attachedVmIds.map((id) => state.vms.find((v) => v.id === id)?.name ?? id),
    ];

    return {
      lines: [
        `name: ${nsg.name}`,
        `network: ${state.vpcs.find((v) => v.id === nsg.vpcId)?.name ?? '(none)'}`,
        `status: ${nsg.status}`,
        `targets: ${targets.length > 0 ? targets.join(', ') : '(none)'}`,
        `rules: ${nsg.rules.length}`,
        ...nsg.rules.map((rule) =>
          [
            `  - ${rule.name}`,
            `    direction: ${rule.direction}`,
            `    priority: ${rule.priority}`,
            `    action: ${rule.action}`,
            `    source: ${rule.sourceCidr}`,
            `    destination: ${rule.destCidr}`,
            `    protocol: ${rule.protocol}`,
            `    port: ${rule.portRange ?? 'all'}`,
          ].join('\n')
        ),
      ],
    };
  }

  if (parts[0] === 'gcloud' && parts[1] === 'compute' && parts[2] === 'instances' && parts[3] === 'describe') {
    const name = parts[4];
    const vm = state.vms.find((v) => v.name === name);
    if (!vm) return { lines: [`ERROR: Instance [${name ?? ''}] not found.`] };
    const subnet = state.subnets.find((s) => s.id === vm.subnetId);
    const policies = state.nsgs.filter(
      (n) => n.attachedVmIds.includes(vm.id) || (subnet && n.attachedSubnetIds.includes(subnet.id))
    );
    return {
      lines: [
        `name: ${vm.name}`,
        `zone: ${vm.zone}`,
        `machineType: ${vm.machineType}`,
        `status: ${vm.status}`,
        `networkInterfaces:`,
        `  network: ${state.vpcs.find((v) => v.id === vm.vpcId)?.name ?? '-'}`,
        `  subnetwork: ${subnet?.name ?? '-'} (${subnet?.cidr ?? '-'})`,
        `  networkIP: ${vm.internalIp}`,
        `  accessConfigs:`,
        `    - name: External NAT`,
        `      natIP: ${vm.externalIp ?? '(none)'}`,
        `networkTags: ${vm.networkTags.length ? vm.networkTags.join(',') : '(none)'}`,
        `disks: ${vm.diskIds.length ? vm.diskIds.join(',') : '(none)'}`,
        `firewallPolicies: ${policies.length ? policies.map((n) => n.name).join(',') : '(none)'}`,
      ],
    };
  }

  /* ------------------------- deliberately unavailable ---------------------- */

  if (parts[0] === 'gcloud' && parts[1] === 'compute' && (parts[2] === 'ssh' || parts[2] === 'scp')) {
    return { lines: [NOT_SUPPORTED] };
  }

  /* ------------------------------- mutations ------------------------------ */

  if (parts[0] === 'gcloud' && parts[1] === 'compute' && parts[2] === 'networks' && parts[3] === 'create') {
    const name = parts[4];
    if (!name) return { lines: ['ERROR: Missing network name. Usage: gcloud compute networks create <NAME>'] };
    return fromEngine(
      createVpc(state, { name }),
      `Operation "operations/network-${name}" finished successfully.`
    );
  }

  if (parts[0] === 'gcloud' && parts[1] === 'compute' && parts[2] === 'networks' && parts[3] === 'delete') {
    const name = parts[4];
    const vpc = state.vpcs.find((v) => v.name === name);
    if (!vpc) return { lines: [`ERROR: Network [${name ?? ''}] not found.`] };
    return fromEngine(
      deleteVpc(state, vpc.id, { cascade: hasFlag(parts, '--quiet') || hasFlag(parts, '--cascade') }),
      `Operation "operations/network-${name}" finished successfully.`
    );
  }

  if (
    parts[0] === 'gcloud' &&
    parts[1] === 'compute' &&
    parts[2] === 'networks' &&
    parts[3] === 'subnets' &&
    parts[4] === 'create'
  ) {
    const name = parts[5];
    const cidr = parseFlag(parts, '--range');
    if (!name || !cidr) {
      return { lines: ['ERROR: Usage: gcloud compute networks subnets create <NAME> --range=<CIDR> [--network=<VPC>] [--region=<REGION>]'] };
    }
    const vpcName = parseFlag(parts, '--network');
    const vpc = vpcName ? state.vpcs.find((v) => v.name === vpcName) : state.vpcs[0];
    if (!vpc) {
      return { lines: [`ERROR: Network [${vpcName ?? '(none)'}] not found. Create a VPC network first.`] };
    }
    return fromEngine(
      createSubnet(state, { name, vpcId: vpc.id, cidr, region: parseFlag(parts, '--region') }),
      `Operation "operations/subnetwork-${name}" finished successfully.`
    );
  }

  if (
    parts[0] === 'gcloud' &&
    parts[1] === 'compute' &&
    parts[2] === 'networks' &&
    parts[3] === 'subnets' &&
    parts[4] === 'delete'
  ) {
    const name = parts[5];
    const subnet = state.subnets.find((s) => s.name === name);
    if (!subnet) return { lines: [`ERROR: Subnetwork [${name ?? ''}] not found.`] };
    return fromEngine(
      deleteSubnet(state, subnet.id, { cascade: hasFlag(parts, '--quiet') }),
      `Operation "operations/subnetwork-${name}" finished successfully.`
    );
  }

  if (parts[0] === 'gcloud' && parts[1] === 'compute' && parts[2] === 'instances' && parts[3] === 'create') {
    const name = parts[4];
    const subnetName = parseFlag(parts, '--subnet') ?? parseFlag(parts, '--subnetwork');
    if (!name || !subnetName) {
      return { lines: ['ERROR: Usage: gcloud compute instances create <NAME> --subnet=<SUBNET> [--zone=<ZONE>] [--external-ip]'] };
    }
    const subnet = state.subnets.find((s) => s.name === subnetName);
    if (!subnet) {
      return { lines: [`ERROR: Subnetwork [${subnetName}] not found. Run "gcloud compute networks subnets list" to see the options.`] };
    }
    return fromEngine(
      createVm(state, {
        name,
        subnetId: subnet.id,
        zone: parseFlag(parts, '--zone') ?? subnet.region + '-a',
        machineType: parseFlag(parts, '--machine-type'),
        withExternalIp: hasFlag(parts, '--external-ip'),
        networkTags: parseFlag(parts, '--tags')?.split(',').filter(Boolean),
      }),
      `Operation "operations/instance-${name}" finished successfully.`
    );
  }

  if (parts[0] === 'gcloud' && parts[1] === 'compute' && parts[2] === 'instances' && parts[3] === 'delete') {
    const name = parts[4];
    const vm = state.vms.find((v) => v.name === name);
    if (!vm) return { lines: [`ERROR: Instance [${name ?? ''}] not found.`] };
    return fromEngine(deleteVm(state, vm.id), `Operation "operations/instance-${name}" finished successfully.`);
  }

  if (
    parts[0] === 'gcloud' &&
    parts[1] === 'compute' &&
    parts[2] === 'instances' &&
    (parts[3] === 'start' || parts[3] === 'stop')
  ) {
    const running = parts[3] === 'start';
    const name = parts[4];
    const vm = state.vms.find((v) => v.name === name);
    if (!vm) return { lines: [`ERROR: Instance [${name ?? ''}] not found.`] };
    return fromEngine(
      setVmRunning(state, vm.id, running),
      `Operation "operations/instance-${name}-${running ? 'start' : 'stop'}" finished successfully.`
    );
  }

  /* --------------------------------- lc lab ------------------------------- */

  if (parts[0] === 'lc' && parts[1] === 'lab') {
    return runLcLabCommand(state, parts);
  }

  return null;
}

function runLcLabCommand(state: SimState, parts: string[]): CliResult {
  const sub = parts[2];

  if (sub === 'sample') {
    return {
      lines: [
        'Sample network loaded: 1 VPC, 3 subnetworks, 3 VM instances, 1 internet gateway, 1 load balancer, 2 firewall policies.',
      ],
      apply: () => buildSampleNetwork(),
    };
  }

  if (sub === 'reset') {
    return { lines: ['Lab reset. All simulated resources removed.'], apply: () => createInitialState() };
  }

  // Self-check the four demo traces against the current lab state.
  if (sub === 'verify-traces' || sub === 'verify') {
    if (state.vpcs.length === 0) {
      return { lines: ['The lab is empty. Run "lc lab sample" first.'] };
    }

    const results = verifyDemoTraces(state);
    const lines = ['Running the four demo traces against the current lab:', ''];
    for (const result of results) {
      lines.push(`${result.pass ? 'PASS' : 'FAIL'}  ${result.label}`);
      lines.push(`      expected ${result.expected}, got ${result.actual}`);
      lines.push(`      ${result.summary}`);
    }
    lines.push('', `${results.filter((r) => r.pass).length}/${results.length} matched expectations.`);
    return { lines };
  }

  if (sub === 'topology') {
    if (state.vpcs.length === 0) {
      return { lines: ['The lab is empty. Run "lc lab sample" to load a demo network.'] };
    }
    const lines: string[] = [];
    for (const vpc of state.vpcs) {
      lines.push(`${vpc.name} (${vpc.id})`);
      for (const subnet of state.subnets.filter((s) => s.vpcId === vpc.id)) {
        lines.push(`  subnet ${subnet.name} ${subnet.cidr} gateway ${subnet.gatewayIp}`);
        for (const vm of state.vms.filter((v) => v.subnetId === subnet.id)) {
          lines.push(
            `    vm ${vm.name} ${vm.internalIp}${vm.externalIp ? ` ext ${vm.externalIp}` : ''} [${vm.status}]`
          );
        }
      }
      for (const gateway of state.gateways.filter((g) => g.vpcId === vpc.id)) {
        lines.push(`  internet-gateway ${gateway.name} [${gateway.status}]`);
      }
      for (const lb of state.loadBalancers.filter((l) => l.vpcId === vpc.id)) {
        lines.push(`  loadbalancer ${lb.name} ${lb.frontendIp}:${lb.port} (${lb.type})`);
      }
      for (const nsg of state.nsgs.filter((n) => n.vpcId === vpc.id)) {
        lines.push(
          `  firewall ${nsg.name}: ${plural(nsg.rules.length, 'rule')}, ${plural(nsg.attachedSubnetIds.length, 'subnet target')}`
        );
      }
    }
    return { lines };
  }

  if (sub === 'route') {
    const ip = parts[3];
    if (!ip) return { lines: ['ERROR: Usage: lc lab route <IP>'] };
    // Longest prefix wins, resolved by the same code the packet tracer uses.
    const allRoutes = state.vpcs.flatMap((vpc) => buildRouteTable(state, vpc.id));
    const match = selectRoute(allRoutes, ip);
    if (!match) {
      return { lines: [`No route matches ${ip}. The packet would be dropped at the route table.`] };
    }
    return { lines: [`${ip} matches ${match.destCidr} via ${match.nextHop} (priority ${match.priority}).`] };
  }

  if (sub === 'trace') {
    const [sourceIp, destIp, port] = parts.slice(3);
    if (!sourceIp || !destIp) {
      return { lines: ['ERROR: Usage: lc lab trace <SRC_IP> <DST_IP> [PORT]'] };
    }
    const destinationPort = port ? Number(port) : 80;
    if (!Number.isInteger(destinationPort) || destinationPort < 1 || destinationPort > 65535) {
      return { lines: [`ERROR: [${port}] is not a valid port. Use 1-65535.`] };
    }

    // Run the trace now so the shell prints the verdict, and also hand it to the
    // store so it shows up on the Packet tracer page.
    const result = evaluatePacket(state, { sourceIp, destIp, protocol: 'tcp', destPort: destinationPort });
    const dropHop = [...result.hops].reverse().find((hop) => hop.decision === 'DROP');
    const lines = [
      `Tracing ${sourceIp} -> ${destIp}:${destinationPort} (tcp)`,
      '',
      ...result.hops.map((hop) => `  ${String(hop.order).padStart(2)}. [${hop.decision}] ${hop.label}: ${hop.reason}`),
      '',
      result.verdict === 'ALLOWED' ? `ALLOWED: ${result.summary}` : `BLOCKED at ${result.blockedAt}: ${result.summary}`,
    ];
    if (dropHop?.fix) lines.push(`FIX: ${dropHop.fix}`);

    return { lines, trace: { sourceIp, destIp, destPort: destinationPort } };
  }

  if (sub === undefined) {
    return { lines: ['ERROR: Missing lab subcommand. Try "lc lab topology", "lc lab sample", or "lc lab trace".'] };
  }

  return { lines: [`ERROR: Unknown lab command [${sub}]. Type "help" to see the available lab commands.`] };
}

/**
 * Whether a command string belongs to the lab command table. Used to append the
 * lab help lines and to decide whether to try the lab engine first.
 */
export function isNetlabCommand(command: string): boolean {
  const trimmed = command.trim();
  if (trimmed.startsWith('lc lab')) return true;
  if (!trimmed.startsWith('gcloud compute')) return false;
  return /(^|\s)(networks|instances|routers|forwarding-rules|firewall-rules|ssh|scp)(\s|$)/.test(trimmed);
}

/** Exposed for tests: validates the destination CIDR used by `lc lab route`. */
export function isRoutableCidr(value: string): boolean {
  return isValidCidr(value);
}