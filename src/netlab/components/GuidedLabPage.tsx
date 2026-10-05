/**
 * Guided lab: a four-step tutorial that drives the learner through building the
 * sample network and explaining why each of the four demo packets is allowed or
 * blocked.
 *
 * Progress is tracked per step so a learner can resume where they stopped.
 */

import React from 'react';
import { useNetLab } from '../NetLabContext';
import { Button, Callout, Card } from './ui';

interface Step {
  id: string;
  title: string;
  goal: string;
  instructions: string[];
  expected: string;
  /** Section to jump to when the learner needs the relevant page. */
  section: string;
}

const STEPS: Step[] = [
  {
    id: 'build',
    title: 'Build the sample network',
    goal: 'Create a VPC, three subnetworks, three VM instances, and a gateway.',
    instructions: [
      'Create a VPC network named demo-vpc.',
      'Create subnetworks web-subnet 10.0.1.0/24, app-subnet 10.0.2.0/24, and db-subnet 10.0.3.0/24 in that VPC.',
      'Create VMs web-1, app-1, and db-1, one per subnetwork.',
      'Create and attach an internet gateway so VMs can get external IPs.',
    ],
    expected:
      'A three-tier topology. Each VM takes the first free address, so internal IPs are 10.0.1.2, 10.0.2.2, and 10.0.3.2.',
    section: 'netlab-vpc',
  },
  {
    id: 'firewall',
    title: 'Write the firewall rules',
    goal: 'Allow only what each tier needs and leave the database private.',
    instructions: [
      'Create a policy attached to the web subnet: allow ingress TCP 80 from 0.0.0.0/0.',
      'Create a policy attached to the database subnet: allow ingress TCP 5432 from 10.0.2.0/24 (the app tier) only.',
      'Add an SSH rule from your office range to the web subnet.',
    ],
    expected: 'db-1 is not reachable from the internet, and app-1 can still reach the database.',
    section: 'netlab-firewall',
  },
  {
    id: 'loadbalancer',
    title: 'Put a load balancer in front',
    goal: 'Expose the web tier on port 80 without opening SSH.',
    instructions: [
      'Create an external HTTP load balancer on port 80.',
      'Add web-1 as the backend.',
      'Make sure an ingress rule allows TCP 80 from 0.0.0.0/0 on the web subnet.',
    ],
    expected: 'Internet traffic reaches the backend with the load balancer IP as the source.',
    section: 'netlab-loadbalancers',
  },
  {
    id: 'trace',
    title: 'Trace the four demo packets',
    goal: 'Explain each verdict using the rule that decided it.',
    instructions: [
      'Internet to the load balancer on port 80: expect ALLOWED.',
      'Internet to web-1 on port 22: expect BLOCKED at ingress.',
      'app-1 to db-1 on port 5432: expect ALLOWED.',
      'web-1 to db-1 on port 5432: expect BLOCKED, because the rule only allows the app subnet 10.0.2.0/24.',
    ],
    expected: 'Four verdicts that follow directly from the rule priorities and CIDR ranges you configured.',
    section: 'netlab-tracer',
  },
];

export const GuidedLabPage: React.FC = () => {
  const { state, labProgress, markLabStep, setActiveSection, loadSample, guidedLabOpen, setGuidedLabOpen } = useNetLab();

  const completed = STEPS.filter((s) => labProgress[s.id]).length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Guided lab</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Four steps, about fifteen minutes. Each step names the page you need and the result to look for.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setGuidedLabOpen(!guidedLabOpen)}>{guidedLabOpen ? 'Collapse all' : 'Expand all'}</Button>
          <Button variant="primary" onClick={() => void loadSample()}>
            Load sample network
          </Button>
        </div>
      </header>

      <Card title={`Progress · ${completed}/${STEPS.length} steps complete`}>
        <div className="flex gap-1">
          {STEPS.map((step) => (
            <div
              key={step.id}
              className={`h-1.5 flex-1 rounded-full ${labProgress[step.id] ? 'bg-[var(--success)]' : 'bg-[var(--border-color)]'}`}
              aria-hidden="true"
            />
          ))}
        </div>
      </Card>

      {STEPS.map((step, index) => {
        const expanded = guidedLabOpen || labProgress[step.id] || index === 0;
        return (
          <Card
            key={step.id}
            title={`${index + 1}. ${step.title}`}
            action={
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => setActiveSection(step.section)}>
                  Open page
                </Button>
                <Button
                  size="sm"
                  variant={labProgress[step.id] ? 'primary' : 'secondary'}
                  onClick={() => markLabStep(step.id, !labProgress[step.id])}
                >
                  {labProgress[step.id] ? 'Completed' : 'Mark done'}
                </Button>
              </div>
            }
          >
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">Goal: </span>
                {step.goal}
              </p>

              {expanded ? (
                <>
                  <ol className="space-y-1.5">
                    {step.instructions.map((instruction, i) => (
                      <li key={instruction} className="flex gap-2.5 text-xs text-[var(--text-secondary)]">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--bg-canvas)] font-mono text-[10px] text-[var(--text-muted)]">
                          {i + 1}
                        </span>
                        {instruction}
                      </li>
                    ))}
                  </ol>
                  <Callout tone="info" title="What you should see">
                    {step.expected}
                  </Callout>
                </>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">{step.goal}</p>
              )}
            </div>
          </Card>
        );
      })}

      <Card title="Where to look when something is blocked">
        <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
          <li>No matching route: the packet is dropped at the route table. Check that the destination subnet has a local route.</li>
          <li>
            {state.vpcs.length === 0 ? 'Traffic leaving the VPC:' : 'Traffic leaving the VPC:'} a default route to an internet gateway is
            required. Without one, everything outside 10.0.0.0/8 stops at the gateway hop.
          </li>
          <li>Implicit deny: a firewall policy with no matching rule blocks the packet. Lower priority numbers win.</li>
          <li>Load balancer with no healthy backend: the request is dropped before it reaches any VM.</li>
        </ul>
      </Card>
    </div>
  );
};