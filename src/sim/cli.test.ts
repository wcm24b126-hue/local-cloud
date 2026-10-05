import { describe, expect, it } from 'vitest';
import { isNetlabCommand, runNetlabCommand } from './cli';
import { attachInternetGateway, createInitialState, createSubnet, createVm, createVpc } from './engine';
import { buildSampleNetwork } from './seed';
import { SimResult, SimState } from './types';

/** Apply a mutation-returning engine result, failing the test on engine errors. */
function commit<T extends { state: SimState }>(result: SimResult<T>): SimState {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.value.state;
}

/**
 * Run a CLI apply() and return the new state. Fails the test if no apply() was
 * produced, which happens when the engine rejected the command.
 */
function applied(result: { apply?: (current: SimState) => Promise<SimState> | SimState }, state: SimState): SimState {
  if (!result.apply) throw new Error('Expected the command to produce a mutation, but apply() was undefined.');
  return result.apply(state) as SimState;
}

/** Assert an engine mutation was rejected, and that it explains the fix. */
function expectRejected(result: SimResult<{ state: SimState }>) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.howToFix.length).toBeGreaterThan(0);
  }
}

function text(result: { lines: string[] }): string {
  return result.lines.join('\n');
}

/** Build a minimal VPC with one subnet, ready for instance tests. */
function vpcWithSubnet(): SimState {
  let state = commit(createVpc(createInitialState(), { name: 'vpc-1' }));
  state = commit(createSubnet(state, { name: 'sub-1', vpcId: state.vpcs[0].id, cidr: '10.1.0.0/24' }));
  return state;
}

/** Same, but with an internet gateway so external IPs can be assigned. */
function vpcWithSubnetAndGateway(): SimState {
  const state = vpcWithSubnet();
  return commit(attachInternetGateway(state, { name: 'vpc-1-igw', vpcId: state.vpcs[0].id }));
}

describe('isNetlabCommand', () => {
  it('routes lab commands to the lab engine', () => {
    expect(isNetlabCommand('lc lab topology')).toBe(true);
    expect(isNetlabCommand('gcloud compute networks list')).toBe(true);
    expect(isNetlabCommand('gcloud compute instances describe web-1')).toBe(true);
    expect(isNetlabCommand('gcloud compute ssh web-1')).toBe(true);
  });

  it('leaves unrelated console commands alone', () => {
    expect(isNetlabCommand('gcloud projects list')).toBe(false);
    expect(isNetlabCommand('gsutil ls')).toBe(false);
    expect(isNetlabCommand('help')).toBe(false);
  });
});

describe('read-only commands', () => {
  it('lists networks with their subnet ranges', () => {
    expect(text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute networks list')!)).toContain('demo-vpc');
    expect(text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute networks list')!)).toContain('10.0.1.0/24');
  });

  it('reports zero items for an empty lab', () => {
    expect(runNetlabCommand(createInitialState(), 'gcloud compute instances list')!.lines).toEqual(['Listed 0 items.']);
  });

  it('lists instances with internal and external IPs', () => {
    const output = text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute instances list')!);
    expect(output).toContain('web-1');
    expect(output).toContain('10.0.1.2');
    expect(output).toContain('RUNNING');
  });

  it('shows the subnet gateway and in-use count', () => {
    const output = text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute networks subnets list')!);
    expect(output).toContain('10.0.1.1');
    // A /24 has 253 usable addresses once the network, gateway and broadcast are reserved.
    expect(output).toMatch(/\d+\/253/);
  });

  it('describes a single instance including firewall policies', () => {
    const output = text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute instances describe web-1')!);
    expect(output).toContain('name: web-1');
    expect(output).toContain('networkIP: 10.0.1.2');
    expect(output).toContain('natIP:');
    expect(output).toContain('web-nsg');
  });

  it('errors when describing a missing instance', () => {
    expect(text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute instances describe nope')!)).toContain('ERROR');
  });

  it('lists routes including the default route', () => {
    const output = text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute routers list')!);
    expect(output).toContain('0.0.0.0/0');
    expect(output).toContain('internet-gateway');
  });

  it('lists load balancers as forwarding rules with backend names', () => {
    const output = text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute forwarding-rules list')!);
    expect(output).toContain('web-lb');
    expect(output).toContain('web-1');
  });

  it('flattens firewall rules across policies', () => {
    const output = text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute firewall-rules list')!);
    expect(output).toContain('allow-http-from-anywhere');
    expect(output).toContain('allow-ssh-from-office');
    expect(output).toContain('allow-postgres-from-app');
    expect(output).toContain('web-nsg');
    expect(output).toContain('db-nsg');
  });
});

describe('mutating commands', () => {
  it('creates a network through the engine', () => {
    const result = runNetlabCommand(createInitialState(), 'gcloud compute networks create cli-vpc')!;
    expect(result.lines[0]).toContain('finished successfully');
    expect(applied(result, createInitialState()).vpcs.map((v) => v.name)).toEqual(['cli-vpc']);
  });

  it('rejects a duplicate network name without applying anything', () => {
    const state = commit(createVpc(createInitialState(), { name: 'dup-vpc' }));
    const result = runNetlabCommand(state, 'gcloud compute networks create dup-vpc')!;
    expect(result.lines[0]).toContain('ERROR');
    expect(result.apply).toBeUndefined();
  });

  it('creates a subnet with --range and --network', () => {
    const state = commit(createVpc(createInitialState(), { name: 'vpc-1' }));
    const result = runNetlabCommand(
      state,
      'gcloud compute networks subnets create sub-1 --range=10.1.0.0/24 --network=vpc-1'
    )!;
    const next = applied(result, state);
    expect(next.subnets[0].name).toBe('sub-1');
    expect(next.subnets[0].cidr).toBe('10.1.0.0/24');
  });

  it('reports a remediation hint when the subnet range is invalid', () => {
    const state = commit(createVpc(createInitialState(), { name: 'vpc-1' }));
    const result = runNetlabCommand(
      state,
      'gcloud compute networks subnets create sub-1 --range=10.1.0.0/99 --network=vpc-1'
    )!;
    expect(result.lines[0]).toContain('ERROR');
    expect(result.lines[1]).toContain('HINT:');
    expect(result.apply).toBeUndefined();
  });

  it('errors when the required subnet flags are missing', () => {
    const result = runNetlabCommand(createInitialState(), 'gcloud compute networks subnets create sub-1')!;
    expect(result.lines[0]).toContain('Usage:');
  });

  it('errors when creating a subnet in an unknown network', () => {
    const result = runNetlabCommand(
      createInitialState(),
      'gcloud compute networks subnets create sub-1 --range=10.1.0.0/24 --network=missing'
    )!;
    expect(result.lines[0]).toContain('ERROR');
    expect(result.apply).toBeUndefined();
  });

  it('creates an instance with an external IP when the flag is present', () => {
    const state = vpcWithSubnetAndGateway();
    const result = runNetlabCommand(
      state,
      'gcloud compute instances create web-1 --subnet=sub-1 --zone=us-central1-a --external-ip'
    )!;
    const next = applied(result, state);
    expect(next.vms[0].name).toBe('web-1');
    expect(next.vms[0].externalIp).toBeDefined();
  });

  it('refuses an external IP when the VPC has no internet gateway', () => {
    const state = vpcWithSubnet();
    const result = runNetlabCommand(state, 'gcloud compute instances create vm-1 --subnet=sub-1 --external-ip')!;
    expect(result.lines[0]).toContain('no Internet Gateway');
    expect(result.lines[1]).toContain('HINT:');
    expect(result.apply).toBeUndefined();
  });

  it('omits the external IP when the flag is absent', () => {
    const state = vpcWithSubnet();
    const result = runNetlabCommand(state, 'gcloud compute instances create vm-1 --subnet=sub-1')!;
    expect(applied(result, state).vms[0].externalIp).toBeUndefined();
  });

  it('allocates the first usable address for a CLI-created instance', () => {
    const state = vpcWithSubnet();
    const result = runNetlabCommand(state, 'gcloud compute instances create vm-1 --subnet=sub-1')!;
    expect(applied(result, state).vms[0].internalIp).toBe('10.1.0.2');
  });

  it('errors when the required instance flags are missing', () => {
    expect(text(runNetlabCommand(createInitialState(), 'gcloud compute instances create vm-1')!)).toContain('Usage:');
  });

  it('errors when the subnet for an instance does not exist', () => {
    const result = runNetlabCommand(createInitialState(), 'gcloud compute instances create vm-1 --subnet=ghost')!;
    expect(result.lines[0]).toContain('ERROR');
    expect(result.apply).toBeUndefined();
  });

  it('refuses to start or stop an unknown instance', () => {
    expect(text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute instances stop ghost')!)).toContain('ERROR');
  });

  it('stops and starts a known instance', () => {
    const state = buildSampleNetwork();
    const stopped = runNetlabCommand(state, 'gcloud compute instances stop web-1')!;
    expect(applied(stopped, state).vms.find((v) => v.name === 'web-1')?.status).not.toBe('RUNNING');
  });

  it('deletes an instance', () => {
    const state = buildSampleNetwork();
    const result = runNetlabCommand(state, 'gcloud compute instances delete app-1')!;
    const next = applied(result, state);
    expect(next.vms.map((v) => v.name)).not.toContain('app-1');
  });

  it('refuses to delete a network that still has dependencies', () => {
    const state = buildSampleNetwork();
    const result = runNetlabCommand(state, 'gcloud compute networks delete demo-vpc')!;
    expect(result.apply).toBeUndefined();
  });

  it('cascades with --quiet when dependencies exist', () => {
    const state = buildSampleNetwork();
    const result = runNetlabCommand(state, 'gcloud compute networks delete demo-vpc --quiet')!;
    const next = applied(result, state);
    expect(next.vpcs).toHaveLength(0);
    expect(next.subnets).toHaveLength(0);
    expect(next.vms).toHaveLength(0);
  });

  it('errors when deleting a network that does not exist', () => {
    expect(text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute networks delete ghost')!)).toContain('ERROR');
  });

  it('deletes an empty subnet', () => {
    const state = vpcWithSubnet();
    const result = runNetlabCommand(state, 'gcloud compute networks subnets delete sub-1')!;
    expect(applied(result, state).subnets).toHaveLength(0);
  });
});

describe('simulation-only guarantees', () => {
  it('refuses to run ssh', () => {
    expect(text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute ssh web-1 --zone=us-central1-a')!)).toContain(
      'simulation-only'
    );
  });

  it('refuses to run scp', () => {
    expect(text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute scp file.txt web-1:~/')!)).toContain(
      'simulation-only'
    );
  });
});

describe('lc lab helpers', () => {
  it('loads the sample network', () => {
    const next = applied(runNetlabCommand(createInitialState(), 'lc lab sample')!, createInitialState());
    expect(next.vpcs).toHaveLength(1);
    expect(next.subnets).toHaveLength(3);
    expect(next.vms).toHaveLength(3);
  });

  it('resets to an empty lab', () => {
    expect(applied(runNetlabCommand(buildSampleNetwork(), 'lc lab reset')!, buildSampleNetwork()).vpcs).toHaveLength(0);
  });

  it('prints an indented topology tree', () => {
    const output = text(runNetlabCommand(buildSampleNetwork(), 'lc lab topology')!);
    expect(output).toContain('demo-vpc');
    expect(output).toContain('  subnet web-subnet');
    expect(output).toContain('    vm web-1');
    expect(output).toContain('loadbalancer web-lb');
    expect(output).toContain('internet-gateway demo-vpc-igw');
  });

  it('reports an empty lab in the topology view', () => {
    expect(text(runNetlabCommand(createInitialState(), 'lc lab topology')!)).toContain('empty');
  });

  it('resolves which route an address takes', () => {
    const state = buildSampleNetwork();
    expect(text(runNetlabCommand(state, 'lc lab route 8.8.8.8')!)).toContain('0.0.0.0/0');
    expect(text(runNetlabCommand(state, 'lc lab route 10.0.2.5')!)).toContain('10.0.2.0/24');
  });

  it('reports no matching route when the lab has no routes', () => {
    expect(text(runNetlabCommand(createInitialState(), 'lc lab route 8.8.8.8')!)).toContain('No route matches');
  });

  it('requires an address for the route helper', () => {
    expect(text(runNetlabCommand(buildSampleNetwork(), 'lc lab route')!)).toContain('Usage:');
  });

  it('prints a hop-by-hop trace for an allowed packet', () => {
    const result = runNetlabCommand(buildSampleNetwork(), 'lc lab trace 10.0.2.2 10.0.3.2 5432')!;
    expect(text(result)).toContain('ALLOWED');
    expect(text(result)).toContain('[PASS]');
    expect(result.trace).toEqual({ sourceIp: '10.0.2.2', destIp: '10.0.3.2', destPort: 5432 });
  });

  it('prints the drop hop and a fix for a blocked packet', () => {
    const result = runNetlabCommand(buildSampleNetwork(), 'lc lab trace 198.51.100.7 10.0.1.2 22')!;
    expect(text(result)).toContain('BLOCKED');
    expect(text(result)).toContain('[DROP]');
    expect(text(result)).toContain('FIX:');
  });

  it('validates the trace port argument', () => {
    const state = buildSampleNetwork();
    expect(text(runNetlabCommand(state, 'lc lab trace 10.0.2.2 10.0.3.2 99999')!)).toContain('ERROR');
    expect(text(runNetlabCommand(state, 'lc lab trace 10.0.2.2')!)).toContain('Usage:');
  });

  it('defaults the trace port to 80 when omitted', () => {
    expect(runNetlabCommand(buildSampleNetwork(), 'lc lab trace 10.0.2.2 10.0.3.2')!.trace?.destPort).toBe(80);
  });

  it('explains a missing subcommand', () => {
    expect(text(runNetlabCommand(buildSampleNetwork(), 'lc lab')!)).toContain('Missing lab subcommand');
  });

  it('rejects an unknown subcommand', () => {
    expect(text(runNetlabCommand(buildSampleNetwork(), 'lc lab frobnicate')!)).toContain('Unknown lab command');
  });
});

describe('fallthrough behaviour', () => {
  it('returns null for commands the lab does not own', () => {
    expect(runNetlabCommand(buildSampleNetwork(), 'gcloud projects list')).toBeNull();
    expect(runNetlabCommand(buildSampleNetwork(), 'gsutil ls')).toBeNull();
  });

  it('returns null for an empty command', () => {
    expect(runNetlabCommand(buildSampleNetwork(), '   ')).toBeNull();
  });
});

describe('engine guards reachable from the CLI', () => {
  it('rejects a non-integer boot disk size', () => {
    const state = vpcWithSubnet();
    expectRejected(createVm(state, { name: 'vm-1', subnetId: state.subnets[0].id, bootDiskSizeGb: 12.5 }));
  });

  it('rejects a boot disk size below the minimum', () => {
    const state = vpcWithSubnet();
    expectRejected(createVm(state, { name: 'vm-1', subnetId: state.subnets[0].id, bootDiskSizeGb: 5 }));
  });
});

describe('read-only describe and self-check commands', () => {
  it('describes a firewall policy with its rules and targets', () => {
    const output = text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute firewall-rules describe web-nsg')!);
    expect(output).toContain('name: web-nsg');
    expect(output).toContain('network: demo-vpc');
    expect(output).toContain('targets: web-subnet');
    expect(output).toContain('allow-http-from-anywhere');
    expect(output).toContain('deny-all-ingress');
    // Port 5432 belongs to the database policy, not the web one.
    expect(output).toContain('port: 80');
    expect(output).toContain('port: 22');
    expect(output).not.toContain('port: 5432');
  });

  it('describes the database policy scoped to the app subnet', () => {
    const output = text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute firewall-rules describe db-nsg')!);
    expect(output).toContain('name: db-nsg');
    expect(output).toContain('targets: db-subnet');
    expect(output).toContain('port: 5432');
    expect(output).toContain('source: 10.0.2.0/24');
  });

  it('reports an unknown firewall policy as not found', () => {
    const output = text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute firewall-rules describe nope')!);
    expect(output).toContain('ERROR: Policy [nope] not found.');
  });

  it('exports the topology through the gcloud command shape', () => {
    const output = text(runNetlabCommand(buildSampleNetwork(), 'gcloud compute networks topologies export')!);
    expect(output).toContain('demo-vpc');
    expect(output).toContain('  subnet web-subnet');
    expect(output).toContain('    vm web-1');
  });

  it('reports the real seeded counts in the sample summary', () => {
    const output = text(runNetlabCommand(createInitialState(), 'lc lab sample')!);
    expect(output).toContain('1 VPC, 3 subnetworks, 3 VM instances');
  });

  it('self-checks the four demo traces against a freshly seeded lab', () => {
    const output = text(runNetlabCommand(buildSampleNetwork(), 'lc lab verify-traces')!);
    expect(output).toContain('4/4 matched expectations.');
    expect(output.match(/PASS/g)).toHaveLength(4);
    expect(output).not.toContain('FAIL');
  });

  it('fails the self-check after firewall rules are removed', () => {
    let state = buildSampleNetwork();
    state = { ...state, nsgs: [] };
    const output = text(runNetlabCommand(state, 'lc lab verify-traces')!);
    expect(output).toContain('matched expectations.');
    expect(output).toContain('FAIL');
  });

  it('tells the learner to seed an empty lab before self-checking', () => {
    const output = text(runNetlabCommand(createInitialState(), 'lc lab verify-traces')!);
    expect(output).toContain('The lab is empty');
  });
});
