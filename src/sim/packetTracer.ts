/**
 * The packet tracer.
 *
 * `evaluatePacket` is a pure function: same state + same packet always produce
 * the same TraceResult. It walks the packet through the same decision points a
 * real GCP network would, recording a hop for each one with a human-readable
 * reason so a learner can see exactly why traffic was allowed or dropped.
 */

import {
  evaluateEgressFor,
  evaluateIngressFor,
  gatewayFor,
  healthyBackends,
  nsgsForVm,
  pickBackend,
  protocolMatches,
  portMatches,
} from './engine';
import { ipInCidr, parseCidr, parseIpv4 } from './ip';
import {
  LoadBalancer,
  Packet,
  Route,
  SimState,
  Subnet,
  TraceDecision,
  TraceHop,
  TraceResult,
  Vm,
} from './types';

interface Endpoint {
  kind: 'vm' | 'lb' | 'external';
  vm?: Vm;
  lb?: LoadBalancer;
  subnet?: Subnet;
  /** Route that will be used to reach this destination (VPC-internal only). */
  route?: Route;
}

function hop(
  order: number,
  component: TraceHop['component'],
  label: string,
  decision: TraceDecision,
  reason: string,
  extra?: { matchedRuleId?: string; resourceId?: string; fix?: string }
): TraceHop {
  return { order, component, label, decision, reason, ...extra };
}

function findVmByIp(state: SimState, ip: string): Vm | undefined {
  return state.vms.find((vm) => vm.internalIp === ip || vm.externalIp === ip);
}

function findLbByFrontend(state: SimState, ip: string): LoadBalancer | undefined {
  return state.loadBalancers.find((lb) => lb.frontendIp === ip);
}

function subnetForIp(state: SimState, ip: string): Subnet | undefined {
  return state.subnets.find((subnet) => ipInCidr(ip, subnet.cidr));
}

/**
 * Build the effective route table for a VPC: one implicit `local` route per
 * subnet plus every explicit route. Local routes are computed on demand so they
 * can never drift out of sync with the current subnet list.
 */
export function buildRouteTable(state: SimState, vpcId: string): Route[] {
  const localRoutes: Route[] = state.subnets
    .filter((subnet) => subnet.vpcId === vpcId)
    .map((subnet) => ({
      id: `local-${subnet.id}`,
      vpcId,
      name: `local-${subnet.name}`,
      destCidr: subnet.cidr,
      nextHop: 'local' as const,
      priority: 1000,
      isImplicit: true,
      createdAt: subnet.createdAt,
    }));

  const explicit = state.routes.filter((route) => route.vpcId === vpcId);
  return [...localRoutes, ...explicit];
}

/**
 * Choose the route for a destination using longest prefix match, with ties
 * broken by the lowest priority number.
 */
export function selectRoute(routes: Route[], destIp: string): Route | undefined {
  let best: Route | undefined;
  let bestPrefix = -1;

  for (const route of routes) {
    const block = parseCidr(route.destCidr);
    if (!block) continue;
    const destValue = parseIpv4(destIp);
    if (destValue === null) continue;
    if (destValue < block.network || destValue > block.broadcast) continue;

    if (block.prefix > bestPrefix || (block.prefix === bestPrefix && best && route.priority < best.priority)) {
      best = route;
      bestPrefix = block.prefix;
    }
  }

  return best;
}

function resolveEndpoint(state: SimState, ip: string): Endpoint {
  const vm = findVmByIp(state, ip);
  if (vm) return { kind: 'vm', vm, subnet: subnetForIp(state, vm.internalIp) };

  const lb = findLbByFrontend(state, ip);
  if (lb) return { kind: 'lb', lb, subnet: subnetForIp(state, lb.frontendIp) };

  // Neither a VM nor a load balancer. If the address still falls inside one of
  // the VPC's subnets then it is an internal address with nothing behind it,
  // which is a "no route to host" rather than internet traffic.
  return { kind: 'external', subnet: subnetForIp(state, ip) };
}

/**
 * Run a packet through the simulated network.
 *
 * Verdict is ALLOWED only when every checkpoint passes. On a DROP the result
 * carries the failing hop, a plain-English summary, and a `fix` hint on the hop
 * that dropped so the UI can show "How to fix".
 */
export function evaluatePacket(state: SimState, packet: Packet): TraceResult {
  const hops: TraceHop[] = [];
  let order = 0;

  const destPort = packet.destPort ?? null;
  const isIcmp = packet.protocol === 'icmp';
  const port = isIcmp ? null : destPort;

  const push = (h: Omit<TraceHop, 'order'>): TraceHop => {
    order += 1;
    const entry: TraceHop = { ...h, order };
    hops.push(entry);
    return entry;
  };

  const blocked = (h: TraceHop, summary: string): TraceResult => ({
    verdict: 'BLOCKED',
    blockedAt: String(h.order),
    hops,
    summary,
  });

  /* --- 1. Locate source and destination ---------------------------- */

  if (!parseIpv4(packet.sourceIp) || !parseIpv4(packet.destIp)) {
    const h = push(
      hop(0, 'source', 'Invalid packet', 'DROP', `"${!parseIpv4(packet.sourceIp) ? packet.sourceIp : packet.destIp}" is not a valid IPv4 address.`, {
        fix: 'Enter dotted-quad addresses, for example 10.0.1.10.',
      })
    );
    return blocked(h, 'The packet could not be evaluated because an address is malformed.');
  }

  const source = resolveEndpoint(state, packet.sourceIp);
  const dest = resolveEndpoint(state, packet.destIp);

  if (source.kind === 'external' && source.subnet) {
    // An IP that lands inside a subnet range but matches no VM.
    const h = push(
      hop(0, 'source', `Source ${packet.sourceIp}`, 'DROP', `No instance owns internal address ${packet.sourceIp} in subnet "${source.subnet.name}".`, {
        resourceId: source.subnet.id,
        fix: `Pick a running VM in "${source.subnet.name}", for example ${source.subnet.usedIps[0] ?? 'an allocated address'}.`,
      })
    );
    return blocked(h, `No route to host: ${packet.sourceIp} is inside ${source.subnet.name} but no VM has that address.`);
  }

  if (source.kind === 'external') {
    push(
      hop(0, 'source', `Source ${packet.sourceIp} (Internet)`, 'INFO', 'Source is outside the VPC. It is treated as an arbitrary address on the public internet.')
    );
  } else {
    push(
      hop(0, 'source', `Source ${packet.sourceIp} (${source.vm?.name})`, 'INFO', `Source is VM "${source.vm?.name}" at internal address ${packet.sourceIp}.`, {
        resourceId: source.vm?.id,
      })
    );
  }

  if (dest.kind === 'external' && dest.subnet) {
    const h = push(
      hop(0, 'destination', `Destination ${packet.destIp}`, 'DROP', `No instance or load balancer owns ${packet.destIp} in subnet "${dest.subnet.name}".`, {
        resourceId: dest.subnet.id,
        fix: 'Choose a VM or load balancer from the destination list, or delete the stale resource.',
      })
    );
    return blocked(h, `No route to host: ${packet.destIp} is inside ${dest.subnet.name} but nothing is listening there.`);
  }

  if (dest.kind === 'external') {
    push(
      hop(0, 'destination', `Destination ${packet.destIp} (Internet)`, 'INFO', 'Destination is outside the VPC. Traffic must leave through the Internet Gateway.')
    );
  } else if (dest.kind === 'lb') {
    push(
      hop(0, 'destination', `Destination ${packet.destIp} (${dest.lb?.name} load balancer)`, 'INFO', `Destination is the frontend of load balancer "${dest.lb?.name}".`, {
        resourceId: dest.lb?.id,
      })
    );
  } else {
    push(
      hop(0, 'destination', `Destination ${packet.destIp} (${dest.vm?.name})`, 'INFO', `Destination is VM "${dest.vm?.name}" at internal address ${packet.destIp}.`, {
        resourceId: dest.vm?.id,
      })
    );
  }

  /* --- 2. Egress check at the source ------------------------------ */

  if (source.kind === 'vm' && source.vm) {
    const sourceNsgs = nsgsForVm(state, source.vm);
    const egress = evaluateEgressFor(state, source.vm, packet.destIp, port, packet.protocol);

    if (egress.action === 'deny') {
      const h = push(
        hop(0, 'nsg-egress', `Egress firewall on ${source.vm.name}`, 'DROP', `Egress denied by a firewall policy rule (${sourceNsgs.map((n) => n.name).join(', ') || 'unattached'}).`, {
          fix: 'Add an egress rule with a lower priority number that allows this protocol and port to the destination CIDR.',
        })
      );
      return blocked(h, `BLOCKED at egress: a firewall policy on "${source.vm.name}" denies ${packet.protocol}${port ? `/${port}` : ''} to ${packet.destIp}.`);
    }

    push(
      hop(0, 'nsg-egress', `Egress firewall on ${source.vm.name}`, 'PASS', egress.matchedRuleId ? 'Matched an explicit allow rule.' : 'No egress rule matched. GCP applies an implied allow-all egress rule at priority 65535.', {
        matchedRuleId: egress.matchedRuleId,
        resourceId: source.vm.id,
      })
    );
  } else if (source.kind === 'lb') {
    push(
      hop(0, 'nsg-egress', `Egress firewall on ${source.lb?.name}`, 'PASS', 'Load balancer frontends are not subject to VM egress policies.')
    );
  }

  /* --- 3. Routing ------------------------------------------------- */

  // Determine the VPC the packet is routed within. For traffic from the
  // internet into the VPC, use the destination's VPC.
  const routingVpcId =
    source.kind === 'vm' && source.vm
      ? source.vm.vpcId
      : dest.kind === 'lb' && dest.lb
        ? dest.lb.vpcId
        : dest.kind === 'vm' && dest.vm
          ? dest.vm.vpcId
          : undefined;

  const gateway = routingVpcId ? gatewayFor(state, routingVpcId) : undefined;

  // An external load balancer frontend is a Google-managed anycast address. It
  // is reached from the internet over Google's edge network, so the packet never
  // consults the VPC route table and does not need an Internet Gateway. Only the
  // backend VMs themselves need egress.
  const destIsExternalLb = dest.kind === 'lb' && dest.lb?.type === 'external-http';

  if (destIsExternalLb) {
    push(
      hop(0, 'route-table', 'Google edge network', 'PASS', 'The destination is an external load balancer frontend IP. Traffic is routed by Google to the closest load balancer, not by the VPC route table.', {
        resourceId: dest.lb?.id,
      })
    );
  } else if (routingVpcId) {
    const routes = buildRouteTable(state, routingVpcId);
    const route = selectRoute(routes, packet.destIp);

    if (!route) {
      const h = push(
        hop(0, 'route-table', 'VPC route table', 'DROP', 'No route in this VPC matches the destination address.', {
          fix: gateway
            ? 'Add a custom route for the destination CIDR, or confirm the Internet Gateway is attached.'
            : 'Attach an Internet Gateway to the VPC so 0.0.0.0/0 exists, or add a custom route.',
        })
      );
      return blocked(h, `BLOCKED at routing: no route matches ${packet.destIp}.`);
    }

    const isLocal = route.nextHop === 'local';

    if (route.nextHop === 'internet-gateway') {
      if (!gateway) {
        const h = push(
          hop(0, 'route-table', 'VPC route table', 'DROP', 'The default route points at an Internet Gateway that is no longer attached.', {
            fix: 'Attach an Internet Gateway to this VPC, or delete the stale route.',
          })
        );
        return blocked(h, 'BLOCKED at routing: the Internet Gateway is detached, so there is no path to the internet.');
      }

      // Outbound: needs an external IP (or NAT). Inbound from the internet:
      // the source is external so it is inherently reachable.
      const sourceVm = source.kind === 'vm' ? source.vm : undefined;
      if (sourceVm && !sourceVm.externalIp) {
        const h = push(
          hop(0, 'internet-gateway', `Internet Gateway ${gateway.name}`, 'DROP', `VM "${sourceVm.name}" has no external IP address, so it cannot originate traffic to the internet.`, {
            resourceId: gateway.id,
            fix: 'Edit the VM and add an external IP address, or send the traffic from a VM that already has one.',
          })
        );
        return blocked(h, `BLOCKED at the Internet Gateway: "${sourceVm.name}" has no external IP address.`);
      }

      push(
        hop(0, 'route-table', 'VPC route table', 'PASS', `Matched route "${route.name}": ${route.destCidr} -> internet-gateway (longest prefix match).`, {
          resourceId: route.id,
        })
      );
      push(
        hop(0, 'internet-gateway', `Internet Gateway ${gateway.name}`, 'PASS', `Route 0.0.0.0/0 resolved to "${gateway.name}". Traffic ${sourceVm ? 'leaves' : 'enters'} the VPC here.`, {
          resourceId: gateway.id,
        })
      );
    } else if (isLocal) {
      const localSubnet = state.subnets.find((s) => s.cidr === route.destCidr);
      push(
        hop(0, 'route-table', 'VPC route table', 'PASS', `Matched local route "${route.name}": ${route.destCidr} is inside this VPC.`, {
          resourceId: route.id,
        })
      );
      if (localSubnet) {
        push(
          hop(0, 'subnet', `Subnet ${localSubnet.name}`, 'PASS', `Destination ${packet.destIp} falls inside subnet "${localSubnet.name}" (${localSubnet.cidr}).`, {
            resourceId: localSubnet.id,
          })
        );
      }
    } else {
      const nextHopVm = state.vms.find((vm) => vm.id === route.nextHopRefId);
      push(
        hop(0, 'route-table', 'VPC route table', 'PASS', `Matched custom route "${route.name}": ${route.destCidr} -> ${nextHopVm?.name ?? 'vm'} (priority ${route.priority}).`, {
          resourceId: route.id,
        })
      );
    }
  }

  /* --- 4. Load balancer ------------------------------------------- */

  let targetVm: Vm | undefined;

  if (dest.kind === 'lb' && dest.lb) {
    const lb = dest.lb;
    const matchesFrontend = packet.protocol === lb.protocol && port === lb.port;

    if (!matchesFrontend) {
      const h = push(
        hop(0, 'load-balancer', `Load balancer ${lb.name}`, 'DROP', `No forwarding rule matches ${packet.protocol}${port ? `/${port}` : ''}. This LB forwards ${lb.protocol}/${lb.port}.`, {
          resourceId: lb.id,
          fix: `Send the packet to ${lb.protocol}/${lb.port}, or create a load balancer that forwards ${packet.protocol}/${port}.`,
        })
      );
      return blocked(h, `BLOCKED at the load balancer: "${lb.name}" does not forward ${packet.protocol}${port ? `/${port}` : ''}.`);
    }

    push(
      hop(0, 'load-balancer', `Load balancer ${lb.name} frontend`, 'PASS', `Forwarding rule matched ${lb.protocol}/${lb.port}.`, { resourceId: lb.id })
    );

    const healthy = healthyBackends(state, lb);
    if (healthy.length === 0) {
      const reasons = lb.backendVmIds
        .map((id) => state.vms.find((vm) => vm.id === id))
        .filter((vm): vm is Vm => Boolean(vm))
        .map((vm) => {
          if (vm.status !== 'RUNNING') return `"${vm.name}" is ${vm.status}`;
          const verdict = evaluateIngressFor(state, vm, lb.frontendIp, lb.healthCheck.port, 'tcp');
          return verdict === 'allow' ? `"${vm.name}" is healthy` : `"${vm.name}" fails its health check`;
        });

      const h = push(
        hop(0, 'load-balancer', `Load balancer ${lb.name} backend service`, 'DROP', `No healthy backends. ${reasons.length > 0 ? reasons.join('; ') : 'The backend service is empty.'}`, {
          resourceId: lb.id,
          fix: `Add an ingress rule allowing tcp/${lb.healthCheck.port} from the load balancer, and make sure the backend VM is RUNNING.`,
        })
      );
      const detail = reasons.length > 0 ? ` ${reasons.join('; ')}.` : ' The backend service is empty.';
      return blocked(h, `BLOCKED at the load balancer: "${lb.name}" has no healthy backends.${detail}`);
    }

    const chosen = pickBackend(lb, healthy, packet.sourceIp, packet.sourcePort);
    if (!chosen) {
      const h = push(hop(0, 'load-balancer', `Load balancer ${lb.name} backend service`, 'DROP', 'Backend selection failed.'));
      return blocked(h, 'BLOCKED at the load balancer: backend selection failed.');
    }

    targetVm = chosen;
    push(
      hop(0, 'load-balancer', `Backend selection`, 'PASS', `Selected "${chosen.name}" (${chosen.internalIp}) from ${healthy.length} healthy backend(s) using a hash of ${packet.sourceIp}:${packet.sourcePort ?? 0}.`, {
        resourceId: chosen.id,
      })
    );

    // Re-run ingress against the chosen backend, sourced from the LB frontend.
    const ingress = evaluateIngressFor(state, chosen, lb.frontendIp, port, packet.protocol);
    if (ingress !== 'allow') {
      const h = push(
        hop(0, 'nsg-ingress', `Ingress firewall on ${chosen.name}`, 'DROP', ingress === 'deny' ? 'Denied by an explicit deny rule.' : 'No ingress rule matched, so the implied deny-all ingress rule (priority 65535) applied.', {
          resourceId: chosen.id,
          fix: `Add an ingress rule allowing ${packet.protocol}${port ? `/${port}` : ''} from the load balancer subnet or the VPC range to "${chosen.name}".`,
        })
      );
      return blocked(h, `BLOCKED at ingress on backend "${chosen.name}".`);
    }

    push(
      hop(0, 'nsg-ingress', `Ingress firewall on ${chosen.name}`, 'PASS', 'Matched an ingress allow rule for traffic from the load balancer frontend.', {
        resourceId: chosen.id,
      })
    );
  }

  /* --- 5 & 6. Deliver (or deliver to the destination VM directly) - */

  const finalVm = targetVm ?? (dest.kind === 'vm' ? dest.vm : undefined);

  /* --- Outbound to an address outside the VPC ------------------------ */

  if (!finalVm) {
    // The destination is on the internet. Reaching this point means egress
    // passed, the default route matched and the Internet Gateway accepted the
    // packet, so it is delivered outside the VPC.
    push(
      hop(0, 'destination', `Internet destination ${packet.destIp}`, 'PASS', `Packet left the VPC through "${gateway?.name ?? 'the Internet Gateway'}" and is delivered to ${packet.destIp}.`)
    );
    push(
      hop(0, 'destination', 'Return traffic', 'INFO', 'GCP VPC networks are stateful: once a connection is allowed, the reply path is implicitly allowed.')
    );

    const protoLabel = packet.protocol.toUpperCase();
    const portLabel = port ? `/${port}` : '';
    const sourceLabel = source.kind === 'vm' ? `"${source.vm?.name}"` : packet.sourceIp;

    return {
      verdict: 'ALLOWED',
      hops,
      summary: `ALLOWED: ${protoLabel}${portLabel} from ${sourceLabel} (${packet.sourceIp}) reached ${packet.destIp} on the internet.`,
    };
  }

  if (finalVm.status !== 'RUNNING') {
    const h = push(
      hop(0, 'vm', `VM ${finalVm.name}`, 'DROP', `The instance is ${finalVm.status}, so it cannot accept traffic.`, {
        resourceId: finalVm.id,
        fix: `Start "${finalVm.name}" from the VM instances page, then send the packet again.`,
      })
    );
    return blocked(h, `BLOCKED: "${finalVm.name}" is ${finalVm.status}.`);
  }

  if (targetVm) {
    push(
      hop(0, 'vm', `VM ${finalVm.name}`, 'PASS', `Instance is ${finalVm.status} at ${finalVm.internalIp}.`, { resourceId: finalVm.id })
    );
  }

  /* --- Ingress for the direct-to-VM case --------------------------- */

  if (!targetVm && source.kind !== 'external') {
    // already handled above only for LB; do it for direct VM delivery
  }

  if (!targetVm) {
    // Evaluate ingress against the destination VM. For internet-originated
    // traffic the source is the external address; for VM-to-VM it is the
    // source VM's internal (or external) address as seen by the destination.
    const sourceAddressForIngress = source.kind === 'vm' && source.vm ? source.vm.internalIp : packet.sourceIp;
    const ingress = evaluateIngressFor(state, finalVm, sourceAddressForIngress, port, packet.protocol);

    if (ingress !== 'allow') {
      const explicitDeny = ingress === 'deny';
      const h = push(
        hop(0, 'nsg-ingress', `Ingress firewall on ${finalVm.name}`, 'DROP', explicitDeny ? 'Denied by an explicit deny rule.' : 'No ingress rule matched, so the implied deny-all ingress rule (priority 65535) applied.', {
          resourceId: finalVm.id,
          fix: `Add an ingress rule allowing ${packet.protocol}${port ? `/${port}` : ''} from ${sourceAddressForIngress} to "${finalVm.name}".`,
        })
      );

      const sourceLabel = source.kind === 'vm' ? `"${source.vm?.name}" (${sourceAddressForIngress})` : `"${packet.sourceIp}"`;
      return blocked(
        h,
        `BLOCKED at ingress on "${finalVm.name}": traffic from ${sourceLabel} is ${explicitDeny ? 'denied by a rule' : 'not allowed by any ingress rule (implied deny)'}.`
      );
    }

    push(
      hop(0, 'nsg-ingress', `Ingress firewall on ${finalVm.name}`, 'PASS', 'Matched an ingress allow rule covering this source, protocol and port.', {
        resourceId: finalVm.id,
      })
    );

    push(
      hop(0, 'vm', `VM ${finalVm.name}`, 'PASS', `Instance is ${finalVm.status} at ${finalVm.internalIp}. Packet delivered.`, { resourceId: finalVm.id })
    );
  }

  /* --- 7. Stateful return traffic --------------------------------- */

  push(
    hop(0, 'destination', 'Return traffic', 'INFO', 'GCP VPC networks are stateful: once a connection is allowed, the reply path is implicitly allowed.')
  );

  const protoLabel = packet.protocol.toUpperCase();
  const portLabel = port ? `/${port}` : '';
  const destLabel = finalVm.name;

  return {
    verdict: 'ALLOWED',
    hops,
    summary: `ALLOWED: ${protoLabel}${portLabel} from ${packet.sourceIp} reached "${destLabel}" at ${finalVm.internalIp}.`,
  };
}

export { portMatches, protocolMatches };