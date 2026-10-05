import { describe, expect, it } from 'vitest';
import {
  addRule,
  attachInternetGateway,
  attachNsg,
  createLoadBalancer,
  createNsg,
  createSubnet,
  createVm,
  createVpc,
  createInitialState,
  healthyBackends,
  setVmRunning,
  setLoadBalancerBackends,
} from './engine';
import { evaluatePacket } from './packetTracer';
import { SimResult, SimState } from './types';

const unwrap = <T extends { state: SimState }>(result: SimResult<{ state: SimState } & T>): T & { state: SimState } => {
  if (!result.ok) throw new Error(result.message);
  return result.value as T & { state: SimState };
};

interface Lab {
  state: SimState;
  vpcId: string;
  web: string;
  app: string;
  db: string;
  webNsgId: string;
}

/** A two-tier lab: web subnet (public), app subnet, db subnet. */
function buildLab(): Lab {
  let state = createInitialState();
  const vpc = unwrap(createVpc(state, { name: 'lab-vpc' }));
  state = vpc.state;
  const vpcId = vpc.vpc.id;

  const makeSubnet = (name: string, cidr: string) => {
    const result = createSubnet(state, { name, vpcId, cidr });
    state = unwrap(result).state;
    return result.ok ? result.value.subnet.id : '';
  };

  const webSubnet = makeSubnet('web-subnet', '10.0.1.0/24');
  const appSubnet = makeSubnet('app-subnet', '10.0.2.0/24');
  const dbSubnet = makeSubnet('db-subnet', '10.0.3.0/24');

  const makeVm = (name: string, subnetId: string) => {
    const result = createVm(state, { name, subnetId });
    state = unwrap(result).state;
    return result.ok ? result.value.vm.id : '';
  };

  const web = makeVm('web-1', webSubnet);
  const app = makeVm('app-1', appSubnet);
  const db = makeVm('db-1', dbSubnet);

  const nsg = unwrap(createNsg(state, { name: 'web-nsg', vpcId }));
  state = unwrap(attachNsg(nsg.state, nsg.nsg.id, { vmIds: [web] })).state;

  return { state, vpcId, web, app, db, webNsgId: nsg.nsg.id };
}

const ipOf = (state: SimState, vmId: string) => state.vms.find((vm) => vm.id === vmId)?.internalIp ?? '';

describe('packet resolution', () => {
  it('drops when the destination is inside a subnet but unowned', () => {
    const lab = buildLab();
    const result = evaluatePacket(lab.state, {
      sourceIp: '198.51.100.7',
      destIp: '10.0.1.200',
      protocol: 'tcp',
      destPort: 80,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.summary).toContain('No route to host');
  });

  it('drops malformed addresses', () => {
    const lab = buildLab();
    const result = evaluatePacket(lab.state, { sourceIp: 'not-an-ip', destIp: '10.0.1.2', protocol: 'tcp' });
    expect(result.verdict).toBe('BLOCKED');
  });

  it('rejects a malformed packet without throwing', () => {
    const lab = buildLab();
    const result = evaluatePacket(lab.state, { sourceIp: '', destIp: '', protocol: 'tcp' });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.hops.length).toBeGreaterThan(0);
  });
});

describe('ingress allow and block', () => {
  it('allows SSH from an allowed CIDR and blocks it from another', () => {
    let { state, web, webNsgId } = buildLab();
    const webIp = ipOf(state, web);

    state = unwrap(
      addRule(state, webNsgId, {
        name: 'allow-ssh-office',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'tcp',
        portRange: '22',
        sourceCidr: '203.0.113.0/24',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    const allowed = evaluatePacket(state, { sourceIp: '203.0.113.7', destIp: webIp, protocol: 'tcp', destPort: 22 });
    expect(allowed.verdict).toBe('ALLOWED');
    const ingressHop = allowed.hops.find((h) => h.component === 'nsg-ingress');
    expect(ingressHop?.decision).toBe('PASS');

    const blocked = evaluatePacket(state, { sourceIp: '198.51.100.7', destIp: webIp, protocol: 'tcp', destPort: 22 });
    expect(blocked.verdict).toBe('BLOCKED');
    expect(blocked.summary).toContain('implied deny');
  });
});

describe('implied rules', () => {
  it('denies ingress when no rule matches, and offers a fix', () => {
    const { state, web } = buildLab();
    const result = evaluatePacket(state, {
      sourceIp: '203.0.113.7',
      destIp: ipOf(state, web),
      protocol: 'tcp',
      destPort: 22,
    });
    expect(result.verdict).toBe('BLOCKED');
    const drop = result.hops.find((h) => h.decision === 'DROP');
    expect(drop?.component).toBe('nsg-ingress');
    expect(drop?.fix).toContain('ingress rule');
  });

  it('allows egress when no egress rule matches', () => {
    const { state, app, db } = buildLab();
    // db-nsg has no egress rules at all, so the implied allow-all applies.
    const result = evaluatePacket(state, {
      sourceIp: ipOf(state, app),
      destIp: ipOf(state, db),
      protocol: 'tcp',
      destPort: 3306,
    });
    const egress = result.hops.find((h) => h.component === 'nsg-egress');
    expect(egress?.decision).toBe('PASS');
    expect(egress?.reason).toContain('implied allow-all');
  });

  it('drops on an explicit egress deny', () => {
    let { state, app, db, vpcId } = buildLab();
    const nsg = createNsg(state, { name: 'egress-nsg', vpcId });
    state = unwrap(nsg).state;
    const nsgId = nsg.ok ? nsg.value.nsg.id : '';
    state = unwrap(attachNsg(state, nsgId, { vmIds: [app] })).state;
    state = unwrap(
      addRule(state, nsgId, {
        name: 'deny-db-egress',
        direction: 'egress',
        action: 'deny',
        priority: 100,
        protocol: 'all',
        portRange: 'all',
        sourceCidr: '0.0.0.0/0',
        destCidr: '10.0.3.0/24',
        description: '',
      })
    ).state;

    const result = evaluatePacket(state, {
      sourceIp: ipOf(state, app),
      destIp: ipOf(state, db),
      protocol: 'tcp',
      destPort: 3306,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.hops.find((h) => h.component === 'nsg-egress')?.decision).toBe('DROP');
  });
});

describe('rule priority', () => {
  it('lets a deny at 500 beat an allow at 1000', () => {
    let { state, web, webNsgId } = buildLab();
    const webIp = ipOf(state, web);

    state = unwrap(
      addRule(state, webNsgId, {
        name: 'allow-all',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'all',
        portRange: 'all',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    // A deny that is evaluated later by insertion order but earlier by priority.
    state = unwrap(
      addRule(state, webNsgId, {
        name: 'deny-bad-net',
        direction: 'ingress',
        action: 'deny',
        priority: 500,
        protocol: 'all',
        portRange: 'all',
        sourceCidr: '203.0.113.0/24',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    const result = evaluatePacket(state, { sourceIp: '203.0.113.7', destIp: webIp, protocol: 'tcp', destPort: 22 });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.summary).toContain('denied by a rule');
  });

  it('applies a later allow when the deny does not match the source', () => {
    let { state, web, webNsgId } = buildLab();
    const webIp = ipOf(state, web);

    state = unwrap(
      addRule(state, webNsgId, {
        name: 'deny-office',
        direction: 'ingress',
        action: 'deny',
        priority: 500,
        protocol: 'all',
        portRange: 'all',
        sourceCidr: '203.0.113.0/24',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;
    state = unwrap(
      addRule(state, webNsgId, {
        name: 'allow-anywhere',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'all',
        portRange: 'all',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    const result = evaluatePacket(state, { sourceIp: '198.51.100.7', destIp: webIp, protocol: 'tcp', destPort: 80 });
    expect(result.verdict).toBe('ALLOWED');
  });
});

describe('port and protocol matching', () => {
  it('matches single ports and inclusive ranges', () => {
    let { state, web, webNsgId } = buildLab();
    const webIp = ipOf(state, web);

    state = unwrap(
      addRule(state, webNsgId, {
        name: 'allow-high-range',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'tcp',
        portRange: '8000-8100',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    expect(
      evaluatePacket(state, { sourceIp: '198.51.100.7', destIp: webIp, protocol: 'tcp', destPort: 8080 }).verdict
    ).toBe('ALLOWED');
    expect(
      evaluatePacket(state, { sourceIp: '198.51.100.7', destIp: webIp, protocol: 'tcp', destPort: 7999 }).verdict
    ).toBe('BLOCKED');
    expect(
      evaluatePacket(state, { sourceIp: '198.51.100.7', destIp: webIp, protocol: 'tcp', destPort: 8101 }).verdict
    ).toBe('BLOCKED');
  });

  it('keeps tcp and udp separate', () => {
    let { state, web, webNsgId } = buildLab();
    const webIp = ipOf(state, web);

    state = unwrap(
      addRule(state, webNsgId, {
        name: 'allow-tcp-80',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'tcp',
        portRange: '80',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    expect(
      evaluatePacket(state, { sourceIp: '198.51.100.7', destIp: webIp, protocol: 'tcp', destPort: 80 }).verdict
    ).toBe('ALLOWED');
    expect(
      evaluatePacket(state, { sourceIp: '198.51.100.7', destIp: webIp, protocol: 'udp', destPort: 80 }).verdict
    ).toBe('BLOCKED');
  });

  it('supports a rule with protocol "all"', () => {
    let { state, web, webNsgId } = buildLab();
    const webIp = ipOf(state, web);

    state = unwrap(
      addRule(state, webNsgId, {
        name: 'allow-everything',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'all',
        portRange: 'all',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    expect(
      evaluatePacket(state, { sourceIp: '198.51.100.7', destIp: webIp, protocol: 'tcp', destPort: 443 }).verdict
    ).toBe('ALLOWED');
    expect(
      evaluatePacket(state, { sourceIp: '198.51.100.7', destIp: webIp, protocol: 'udp', destPort: 53 }).verdict
    ).toBe('ALLOWED');
  });

  it('allows ICMP regardless of port', () => {
    let { state, app, db, vpcId } = buildLab();
    const nsg = createNsg(state, { name: 'db-nsg', vpcId });
    state = unwrap(nsg).state;
    const nsgId = nsg.ok ? nsg.value.nsg.id : '';
    state = unwrap(attachNsg(state, nsgId, { vmIds: [db] })).state;
    state = unwrap(
      addRule(state, nsgId, {
        name: 'allow-icmp',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'icmp',
        portRange: null,
        sourceCidr: '10.0.2.0/24',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    expect(
      evaluatePacket(state, { sourceIp: ipOf(state, app), destIp: ipOf(state, db), protocol: 'icmp' }).verdict
    ).toBe('ALLOWED');
  });
});

describe('routing', () => {
  it('drops external destinations when no Internet Gateway is attached', () => {
    const { state, web } = buildLab();
    const result = evaluatePacket(state, {
      sourceIp: ipOf(state, web),
      destIp: '8.8.8.8',
      protocol: 'tcp',
      destPort: 443,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.summary).toContain('route');
  });

  it('drops when the source VM has no external IP', () => {
    const seeded = buildLabWithGateway();
    const appIp = ipOf(seeded.state, seeded.app);
    const result = evaluatePacket(seeded.state, { sourceIp: appIp, destIp: '8.8.8.8', protocol: 'tcp', destPort: 443 });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.summary).toContain('external IP');
  });

  it('reaches the internet with both a gateway and an external IP', () => {
    const { state, webIp } = buildLabWithGateway();
    const result = evaluatePacket(state, { sourceIp: webIp, destIp: '8.8.8.8', protocol: 'tcp', destPort: 443 });
    expect(result.verdict).toBe('ALLOWED');
    expect(result.hops.some((h) => h.component === 'internet-gateway')).toBe(true);
  });
});

/** The same lab, but with an Internet Gateway so the public path exists. */
function buildLabWithGateway(): { state: SimState; web: string; app: string; webIp: string } {
  let state = createInitialState();
  const vpc = unwrap(createVpc(state, { name: 'lab-vpc' }));
  state = vpc.state;

  const webSubnet = unwrap(createSubnet(state, { name: 'web-subnet', vpcId: vpc.vpc.id, cidr: '10.0.1.0/24' }));
  state = webSubnet.state;
  const appSubnet = unwrap(createSubnet(state, { name: 'app-subnet', vpcId: vpc.vpc.id, cidr: '10.0.2.0/24' }));
  state = appSubnet.state;

  state = unwrap(attachInternetGateway(state, { name: 'igw', vpcId: vpc.vpc.id })).state;

  const web = unwrap(createVm(state, { name: 'web-1', subnetId: webSubnet.subnet.id, withExternalIp: true }));
  state = web.state;
  const app = unwrap(createVm(state, { name: 'app-1', subnetId: appSubnet.subnet.id }));
  state = app.state;

  return { state, web: web.vm.id, app: app.vm.id, webIp: web.vm.internalIp };
}

describe('load balancer', () => {
  it('drops when the port does not match the forwarding rule', () => {
    let state = buildLab().state;
    const { vpcId, web } = buildLab();
    const lb = createLoadBalancer(state, {
      name: 'web-lb',
      type: 'external-http',
      vpcId,
      port: 80,
      backendVmIds: [web],
    });
    state = unwrap(lb).state;

    const result = evaluatePacket(state, {
      sourceIp: '198.51.100.7',
      destIp: lb.ok ? lb.value.lb.frontendIp : '',
      protocol: 'tcp',
      destPort: 443,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.hops.find((h) => h.component === 'load-balancer')?.reason).toContain('forwarding rule');
  });

  it('drops when there are no backends at all', () => {
    let state = buildLab().state;
    const { vpcId } = buildLab();
    const lb = createLoadBalancer(state, { name: 'empty-lb', type: 'external-http', vpcId, port: 80, backendVmIds: [] });
    state = unwrap(lb).state;

    const result = evaluatePacket(state, {
      sourceIp: '198.51.100.7',
      destIp: lb.ok ? lb.value.lb.frontendIp : '',
      protocol: 'tcp',
      destPort: 80,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.summary).toContain('no healthy backends');
  });

  it('reports an unhealthy backend and explains why', () => {
    let state = buildLab().state;
    const { vpcId, web, webNsgId } = buildLab();

    // No ingress rule for port 80, so the backend fails its health check.
    state = unwrap(
      addRule(state, webNsgId, {
        name: 'allow-ssh-only',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'tcp',
        portRange: '22',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    const lb = createLoadBalancer(state, { name: 'web-lb', type: 'external-http', vpcId, port: 80, backendVmIds: [web] });
    state = unwrap(lb).state;

    expect(healthyBackends(state, state.loadBalancers[0]!)).toHaveLength(0);

    const result = evaluatePacket(state, {
      sourceIp: '198.51.100.7',
      destIp: lb.ok ? lb.value.lb.frontendIp : '',
      protocol: 'tcp',
      destPort: 80,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.summary).toContain('health check');
  });

  it('allows traffic once a healthy backend exists', () => {
    let state = buildLab().state;
    const { vpcId, web, webNsgId } = buildLab();

    state = unwrap(
      addRule(state, webNsgId, {
        name: 'allow-http',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'tcp',
        portRange: '80',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    const lb = createLoadBalancer(state, { name: 'web-lb', type: 'external-http', vpcId, port: 80, backendVmIds: [web] });
    state = unwrap(lb).state;

    const result = evaluatePacket(state, {
      sourceIp: '198.51.100.7',
      destIp: lb.ok ? lb.value.lb.frontendIp : '',
      protocol: 'tcp',
      destPort: 80,
      sourcePort: 51000,
    });
    expect(result.verdict).toBe('ALLOWED');
    expect(result.hops.some((h) => h.reason.includes('Selected'))).toBe(true);
  });

  it('selects backends deterministically for the same source tuple', () => {
    let state = buildLab().state;
    const { vpcId, web, app, webNsgId } = buildLab();

    state = unwrap(
      addRule(state, webNsgId, {
        name: 'allow-http',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'tcp',
        portRange: '80',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    // Put app-1 into the web subnet region by adding it as a second backend.
    const lb = createLoadBalancer(state, {
      name: 'web-lb',
      type: 'external-http',
      vpcId,
      port: 80,
      backendVmIds: [web, app],
    });
    state = unwrap(lb).state;

    const frontendIp = lb.ok ? lb.value.lb.frontendIp : '';
    const packet = { sourceIp: '198.51.100.7', destIp: frontendIp, protocol: 'tcp' as const, destPort: 80, sourcePort: 40000 };

    const first = evaluatePacket(state, packet);
    const second = evaluatePacket(state, packet);
    const pick = (result: typeof first) => result.hops.find((h) => h.reason.includes('Selected'))?.reason;

    expect(pick(first)).toBeDefined();
    expect(pick(first)).toBe(pick(second));
  });

  it('drops when the only backend is stopped', () => {
    let state = buildLab().state;
    const { vpcId, web, webNsgId } = buildLab();

    state = unwrap(
      addRule(state, webNsgId, {
        name: 'allow-http',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'tcp',
        portRange: '80',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    const lb = createLoadBalancer(state, { name: 'web-lb', type: 'external-http', vpcId, port: 80, backendVmIds: [web] });
    state = unwrap(lb).state;
    state = unwrap(setVmRunning(state, web, false)).state;

    const result = evaluatePacket(state, {
      sourceIp: '198.51.100.7',
      destIp: lb.ok ? lb.value.lb.frontendIp : '',
      protocol: 'tcp',
      destPort: 80,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.summary).toContain('TERMINATED');
  });

  it('reflects backend set changes', () => {
    let state = buildLab().state;
    const { vpcId, web, app } = buildLab();
    const lb = createLoadBalancer(state, { name: 'web-lb', type: 'external-http', vpcId, port: 80, backendVmIds: [web] });
    state = unwrap(lb).state;
    const lbId = state.loadBalancers[0]!.id;

    state = unwrap(setLoadBalancerBackends(state, lbId, [web, app])).state;
    expect(state.loadBalancers[0]?.backendVmIds).toHaveLength(2);
  });
});

describe('VM power state in the tracer', () => {
  it('drops at the VM when the instance is not RUNNING', () => {
    let { state, web, webNsgId } = buildLab();
    const webIp = ipOf(state, web);

    state = unwrap(
      addRule(state, webNsgId, {
        name: 'allow-all',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'all',
        portRange: 'all',
        sourceCidr: '0.0.0.0/0',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;
    state = unwrap(setVmRunning(state, web, false)).state;

    const result = evaluatePacket(state, { sourceIp: '198.51.100.7', destIp: webIp, protocol: 'tcp', destPort: 80 });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.hops.find((h) => h.component === 'vm')?.decision).toBe('DROP');
  });
});

describe('trace shape', () => {
  it('numbers hops in order and ends with a stateful note', () => {
    let { state, app, db, vpcId } = buildLab();
    const nsg = createNsg(state, { name: 'db-nsg', vpcId });
    state = unwrap(nsg).state;
    const nsgId = nsg.ok ? nsg.value.nsg.id : '';
    state = unwrap(attachNsg(state, nsgId, { vmIds: [db] })).state;
    state = unwrap(
      addRule(state, nsgId, {
        name: 'allow-db',
        direction: 'ingress',
        action: 'allow',
        priority: 1000,
        protocol: 'tcp',
        portRange: '5432',
        sourceCidr: '10.0.2.0/24',
        destCidr: '0.0.0.0/0',
        description: '',
      })
    ).state;

    const result = evaluatePacket(state, {
      sourceIp: ipOf(state, app),
      destIp: ipOf(state, db),
      protocol: 'tcp',
      destPort: 5432,
    });

    expect(result.verdict).toBe('ALLOWED');
    expect(result.hops.map((h) => h.order)).toEqual(result.hops.map((_, index) => index + 1));
    expect(result.hops[result.hops.length - 1]?.reason).toContain('stateful');
    expect(result.blockedAt).toBeUndefined();
    expect(result.summary).toContain('ALLOWED');
  });

  it('reports blockedAt for a drop', () => {
    const { state, web } = buildLab();
    const result = evaluatePacket(state, {
      sourceIp: '198.51.100.7',
      destIp: ipOf(state, web),
      protocol: 'tcp',
      destPort: 22,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.blockedAt).toBeDefined();
  });
});