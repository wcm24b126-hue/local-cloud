/**
 * Pure IPv4 / CIDR helpers for the LocalCloud networking simulator.
 *
 * No React, no DOM, no fetch, no DB. Everything here is a deterministic
 * function over 32-bit integers so it can be unit-tested in isolation.
 */

export type IpUint = number;

/** Largest CIDR prefix length the simulator allows for subnets (/29). */
export const MIN_PREFIX_FOR_SUBNET = 8;
/** Smallest CIDR prefix length the simulator allows for subnets (/29). */
export const MAX_PREFIX_FOR_SUBNET = 29;

/**
 * Parse a dotted-quad IPv4 address into an unsigned 32-bit integer.
 * Returns null when the string is not a valid IPv4 literal.
 */
export function parseIpv4(ip: string): IpUint | null {
  if (typeof ip !== 'string') return null;
  const trimmed = ip.trim();
  if (trimmed.length === 0) return null;

  const parts = trimmed.split('.');
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    // Reject empty, non-numeric, and leading-zero forms ("01", "+1", " 1").
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith('0')) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

export function isValidIpv4(ip: string): boolean {
  return parseIpv4(ip) !== null;
}

/** Render an unsigned 32-bit integer back to a dotted-quad string. */
export function formatIpv4(value: IpUint): string {
  const v = value >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.');
}

export interface ParsedCidr {
  /** Network address as an unsigned 32-bit integer. */
  network: IpUint;
  /** Broadcast address as an unsigned 32-bit integer. */
  broadcast: IpUint;
  prefix: number;
  /** Total addresses in the block, e.g. 256 for a /24. */
  size: number;
  /** Number of assignable host addresses (size - 2). */
  usable: number;
}

/**
 * Parse a CIDR block such as "10.0.1.0/24".
 *
 * Unlike strict network parsing, a host address is accepted and normalised to
 * its containing network (GCP also accepts 10.0.1.7/24 and treats it as
 * 10.0.1.0/24). Returns null for malformed input or out-of-range prefixes.
 */
export function parseCidr(cidr: string): ParsedCidr | null {
  if (typeof cidr !== 'string') return null;
  const slash = cidr.indexOf('/');
  if (slash === -1) return null;

  const addrPart = cidr.slice(0, slash).trim();
  const prefixPart = cidr.slice(slash + 1).trim();

  const addr = parseIpv4(addrPart);
  if (addr === null) return null;

  if (!/^\d{1,2}$/.test(prefixPart)) return null;
  const prefix = Number(prefixPart);
  if (prefix < 0 || prefix > 32) return null;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (addr & mask) >>> 0;
  const size = prefix === 0 ? 4294967296 : Math.pow(2, 32 - prefix);
  const broadcast = prefix === 0 ? 0xffffffff : (network + size - 1) >>> 0;

  return {
    network,
    broadcast,
    prefix,
    size,
    usable: prefix >= 31 ? size : Math.max(0, size - 2),
  };
}

export function isValidCidr(cidr: string): boolean {
  return parseCidr(cidr) !== null;
}

/** True when `cidr` is a legal subnet range for this simulator (/8 .. /29). */
export function isValidSubnetCidr(cidr: string): boolean {
  const parsed = parseCidr(cidr);
  if (!parsed) return false;
  return parsed.prefix >= MIN_PREFIX_FOR_SUBNET && parsed.prefix <= MAX_PREFIX_FOR_SUBNET;
}

/** Normalise a CIDR string to its network address form. */
export function normalizeCidr(cidr: string): string | null {
  const parsed = parseCidr(cidr);
  if (!parsed) return null;
  return `${formatIpv4(parsed.network)}/${parsed.prefix}`;
}

/** True when the address falls inside the CIDR block. */
export function ipInCidr(ip: string, cidr: string): boolean {
  const addr = parseIpv4(ip);
  const block = parseCidr(cidr);
  if (addr === null || block === null) return false;
  return addr >= block.network && addr <= block.broadcast;
}

/**
 * True when two CIDR blocks share any address.
 *
 * Uses the standard overlap test: they overlap iff each network contains the
 * other's base address.
 */
export function cidrOverlaps(a: string, b: string): boolean {
  const blockA = parseCidr(a);
  const blockB = parseCidr(b);
  if (!blockA || !blockB) return false;
  const aContainsB = blockB.network >= blockA.network && blockB.network <= blockA.broadcast;
  const bContainsA = blockA.network >= blockB.network && blockA.network <= blockB.broadcast;
  return aContainsB || bContainsA;
}

/**
 * The GCP-style gateway address of a subnet: the first usable host address.
 *
 * For prefixes /31 and /32 GCP does not reserve a separate gateway, so the
 * single address is used directly.
 */
export function gatewayAddress(cidr: string): string | null {
  const block = parseCidr(cidr);
  if (!block) return null;
  if (block.prefix >= 31) return formatIpv4(block.network);
  return formatIpv4(block.network + 1);
}

/**
 * First and last *assignable* addresses of a subnet, excluding the GCP-reserved
 * network, gateway and broadcast addresses.
 *
 * Returns an empty range for prefixes too small to have any usable host
 * address (e.g. /31 has 0 usable per GCP's reservation rules).
 */
export function usableRange(cidr: string): { first: IpUint; last: IpUint } | null {
  const block = parseCidr(cidr);
  if (!block) return null;
  if (block.prefix >= 31) return { first: block.network, last: block.broadcast };
  const first = block.network + 2;
  const last = block.broadcast - 1;
  if (last < first) return null;
  return { first, last };
}

/** Total address count of a CIDR, used for utilisation display. */
export function addressCount(cidr: string): number {
  const block = parseCidr(cidr);
  return block ? block.size : 0;
}

/**
 * Deterministic stable hash (FNV-1a 32-bit).
 * Used for load-balancer backend selection so results are reproducible in tests.
 */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** True when the CIDR is one of the RFC 1918 private ranges. */
export function isPrivateCidr(cidr: string): boolean {
  const privateRanges = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
  return privateRanges.some((range) => ipInCidr(cidr.split('/')[0] ?? '', range));
}

/** Format an unsigned 32-bit integer as canonical dotted-quad, or '' if invalid. */
export function normalizeIp(ip: string): string | null {
  const parsed = parseIpv4(ip);
  return parsed === null ? null : formatIpv4(parsed);
}