/**
 * Network topology graph.
 *
 * Pure SVG with deterministic layout: VPC is a container box, subnetworks are
 * rows, VMs/gateways/load balancers are nodes, and each NSG is a dashed ring
 * around the resources it is attached to. No graph library, so the layout is
 * predictable and easy to reason about while teaching.
 */

import React, { useMemo } from 'react';
import { useNetLab } from '../NetLabContext';

interface Node {
  id: string;
  x: number;
  y: number;
  label: string;
  sublabel: string;
  kind: 'vm' | 'gateway' | 'loadbalancer';
  status: string;
}

const WIDTH = 900;
const ROW_HEIGHT = 132;
const HEADER = 46;

const kindColor: Record<Node['kind'], string> = {
  vm: 'var(--accent-blue)',
  gateway: 'var(--warning)',
  loadbalancer: 'var(--success)',
};

export const TopologyGraph: React.FC = () => {
  const { state } = useNetLab();

  const layout = useMemo(() => {
    const vpcs = state.vpcs;
    const height = Math.max(ROW_HEIGHT * Math.max(1, vpcs.length), ROW_HEIGHT);
    const nodes: Node[] = [];
    const subnetBoxes: { id: string; x: number; y: number; w: number; h: number; label: string; cidr: string }[] = [];

    vpcs.forEach((vpc, vpcIndex) => {
      const top = HEADER + vpcIndex * ROW_HEIGHT;
      const subnets = state.subnets.filter((s) => s.vpcId === vpc.id);

      subnets.forEach((subnet, subnetIndex) => {
        const subnetTop = top + 30 + subnetIndex * 26;
        const slotWidth = (WIDTH - 60) / Math.max(1, subnets.length);

        subnetBoxes.push({
          id: subnet.id,
          x: 30 + subnetIndex * slotWidth,
          y: subnetTop,
          w: slotWidth - 10,
          h: 92,
          label: subnet.name,
          cidr: subnet.cidr,
        });

        const vmsInSubnet = state.vms.filter((v) => v.subnetId === subnet.id);
        const lbsInVpc = state.loadBalancers.filter((lb) => lb.vpcId === vpc.id && state.subnets.some((s) => s.vpcId === vpc.id));
        const gateways = state.gateways.filter((g) => g.vpcId === vpc.id);

        const members: Node[] = [
          ...gateways.map((gw, i) => ({
            id: gw.id,
            x: 40 + subnetIndex * slotWidth + i * 26,
            y: subnetTop - 20,
            label: 'IGW',
            sublabel: gw.name,
            kind: 'gateway' as const,
            status: gw.status,
          })),
          ...lbsInVpc.map((lb, i) => ({
            id: lb.id,
            x: 100 + subnetIndex * slotWidth + i * 120,
            y: subnetTop - 20,
            label: 'LB',
            sublabel: lb.name,
            kind: 'loadbalancer' as const,
            status: lb.status,
          })),
          ...vmsInSubnet.map((vm, i) => ({
            id: vm.id,
            x: 40 + subnetIndex * slotWidth + i * 110,
            y: subnetTop + 34,
            label: vm.name,
            sublabel: vm.internalIp,
            kind: 'vm' as const,
            status: vm.status,
          })),
        ];

        members.forEach((node) => {
          const exists = nodes.some((n) => n.id === node.id);
          if (!exists) nodes.push(node);
        });
      });
    });

    return { nodes, subnetBoxes, height };
  }, [state]);

  if (state.vpcs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-color)] px-6 py-12 text-center">
        <p className="text-sm font-medium text-[var(--text-primary)]">Nothing to draw yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--text-secondary)]">
          Create a VPC network and a subnet, then add VM instances. The topology updates as you build.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-canvas)]">
      <svg
        viewBox={`0 0 ${WIDTH} ${layout.height}`}
        width="100%"
        height={layout.height}
        role="img"
        aria-label="Network topology"
        className="min-w-[720px]"
      >
        {/* Subnetwork boxes */}
        {layout.subnetBoxes.map((box) => (
          <g key={box.id}>
            <rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              rx={10}
              fill="none"
              stroke="var(--border-color)"
              strokeDasharray="4 3"
            />
            <text x={box.x + 10} y={box.y + 16} fill="var(--text-secondary)" fontSize={11} fontFamily="var(--font-mono)">
              {box.label}
            </text>
            <text x={box.x + box.w - 10} y={box.y + 16} textAnchor="end" fill="var(--text-muted)" fontSize={10} fontFamily="var(--font-mono)">
              {box.cidr}
            </text>
          </g>
        ))}

        {/* NSG rings, drawn behind the nodes */}
        {state.nsgs.map((nsg, index) => {
          const targets = [
            ...state.vms.filter((vm) => nsg.attachedVmIds.includes(vm.id)),
            ...state.loadBalancers.filter((lb) => nsg.attachedVmIds.includes(lb.id)),
          ];
          if (targets.length === 0) return null;
          const rects = targets.map((t) => layout.nodes.find((n) => n.id === t.id)).filter(Boolean) as Node[];
          const minX = Math.min(...rects.map((n) => n.x)) - 14;
          const maxX = Math.max(...rects.map((n) => n.x)) + 14;
          const minY = Math.min(...rects.map((n) => n.y)) - 14;
          const maxY = Math.max(...rects.map((n) => n.y)) + 14;
          const cy = minY - 12 + (index % 2) * 12;
          return (
            <g key={nsg.id}>
              <rect
                x={minX}
                y={cy}
                width={Math.max(maxX - minX, 60)}
                height={Math.max(maxY - cy, 50)}
                rx={12}
                fill="var(--accent-blue)"
                fillOpacity={0.05}
                stroke="var(--accent-blue-border)"
                strokeDasharray="2 4"
              />
              <text x={minX + 8} y={cy + 12} fill="var(--accent-blue)" fontSize={9} fontFamily="var(--font-mono)">
                {nsg.name}
              </text>
            </g>
          );
        })}

        {/* VPC labels */}
        {state.vpcs.map((vpc, index) => (
          <g key={vpc.id}>
            <text x={30} y={HEADER - 12 + index * ROW_HEIGHT} fill="var(--text-primary)" fontSize={12} fontWeight={500}>
              {vpc.name}
            </text>
            <text x={30 + vpc.name.length * 8 + 20} y={HEADER - 12 + index * ROW_HEIGHT} fill="var(--text-muted)" fontSize={10} fontFamily="var(--font-mono)">
              {vpc.routingMode} · {state.subnets.filter((s) => s.vpcId === vpc.id).length} subnet(s)
            </text>
          </g>
        ))}

        {/* Nodes and links */}
        {layout.nodes.map((node) => {
          const subnet = state.vms.find((v) => v.id === node.id)?.subnetId;
          const anchorX = subnet
            ? (layout.subnetBoxes.find((b) => b.id === subnet)?.x ?? node.x) + 4
            : node.x;
          const anchorY = subnet
            ? (layout.subnetBoxes.find((b) => b.id === subnet)?.y ?? node.y) - 4
            : node.y + 16;
          const isEdge = node.kind === 'gateway' || node.kind === 'loadbalancer';

          return (
            <g key={node.id}>
              {isEdge && anchorX !== node.x ? (
                <line x1={anchorX} y1={anchorY} x2={node.x + 26} y2={node.y + 16} stroke="var(--border-color)" strokeWidth={1} />
              ) : null}
              <rect
                x={node.x}
                y={node.y}
                width={96}
                height={34}
                rx={7}
                fill="var(--bg-surface)"
                stroke={kindColor[node.kind]}
                strokeWidth={1.2}
                strokeOpacity={node.status === 'RUNNING' || node.status === 'ATTACHED' ? 0.9 : 0.35}
              />
              <text x={node.x + 8} y={node.y + 14} fill="var(--text-primary)" fontSize={10} fontFamily="var(--font-mono)">
                {node.label.length > 14 ? `${node.label.slice(0, 13)}…` : node.label}
              </text>
              <text x={node.x + 8} y={node.y + 26} fill="var(--text-muted)" fontSize={8.5} fontFamily="var(--font-mono)">
                {node.sublabel.length > 16 ? `${node.sublabel.slice(0, 15)}…` : node.sublabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};