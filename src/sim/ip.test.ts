import { describe, expect, it } from 'vitest';
import {
  cidrOverlaps,
  formatIpv4,
  gatewayAddress,
  ipInCidr,
  isPrivateCidr,
  isValidCidr,
  isValidIpv4,
  isValidSubnetCidr,
  normalizeCidr,
  parseCidr,
  parseIpv4,
  stableHash,
  usableRange,
} from './ip';

describe('parseIpv4', () => {
  it('parses valid dotted quads', () => {
    expect(parseIpv4('0.0.0.0')).toBe(0);
    expect(parseIpv4('10.0.1.10')).toBe((10 << 24) | (0 << 16) | (1 << 8) | 10);
    expect(parseIpv4('255.255.255.255')).toBe(4294967295);
  });

  it('rejects malformed input', () => {
    expect(parseIpv4('10.0.1')).toBeNull();
    expect(parseIpv4('10.0.1.1.1')).toBeNull();
    expect(parseIpv4('256.0.0.1')).toBeNull();
    expect(parseIpv4('10.0.1.-1')).toBeNull();
    expect(parseIpv4('a.b.c.d')).toBeNull();
    expect(parseIpv4('')).toBeNull();
    expect(parseIpv4('10.0.1.01')).toBeNull();
    expect(parseIpv4(' 10.0.1.1x')).toBeNull();
  });

  it('round-trips through formatIpv4', () => {
    for (const ip of ['10.0.1.10', '192.168.0.1', '8.8.8.8', '0.0.0.0', '255.255.255.255']) {
      expect(formatIpv4(parseIpv4(ip) as number)).toBe(ip);
    }
  });

  it('exposes a validity helper', () => {
    expect(isValidIpv4('10.0.0.1')).toBe(true);
    expect(isValidIpv4('10.0.0.256')).toBe(false);
  });
});

describe('parseCidr', () => {
  it('computes network, broadcast, size and usable count', () => {
    const block = parseCidr('10.0.1.0/24');
    expect(block).not.toBeNull();
    expect(block?.network).toBe(parseIpv4('10.0.1.0'));
    expect(block?.broadcast).toBe(parseIpv4('10.0.1.255'));
    expect(block?.size).toBe(256);
    expect(block?.usable).toBe(254);
  });

  it('normalises a host address to its network', () => {
    expect(normalizeCidr('10.0.1.77/24')).toBe('10.0.1.0/24');
    expect(normalizeCidr('192.168.1.1/16')).toBe('192.168.0.0/16');
  });

  it('handles /31 and /32', () => {
    const slash31 = parseCidr('10.0.0.0/31');
    expect(slash31?.size).toBe(2);
    const slash32 = parseCidr('10.0.0.5/32');
    expect(slash32?.broadcast).toBe(parseIpv4('10.0.0.5'));
    expect(slash32?.size).toBe(1);
  });

  it('rejects invalid prefixes', () => {
    expect(parseCidr('10.0.0.0/33')).toBeNull();
    expect(parseCidr('10.0.0.0/-1')).toBeNull();
    expect(parseCidr('10.0.0.0')).toBeNull();
    expect(isValidCidr('10.0.0.0/24')).toBe(true);
  });

  it('enforces the /8 to /29 subnet range', () => {
    expect(isValidSubnetCidr('10.0.0.0/8')).toBe(true);
    expect(isValidSubnetCidr('10.0.0.0/29')).toBe(true);
    expect(isValidSubnetCidr('10.0.0.0/30')).toBe(false);
    expect(isValidSubnetCidr('10.0.0.0/7')).toBe(false);
  });
});

describe('ipInCidr', () => {
  it('matches addresses inside and outside a block', () => {
    expect(ipInCidr('10.0.1.5', '10.0.1.0/24')).toBe(true);
    expect(ipInCidr('10.0.1.255', '10.0.1.0/24')).toBe(true);
    expect(ipInCidr('10.0.2.5', '10.0.1.0/24')).toBe(false);
    expect(ipInCidr('10.0.0.255', '10.0.1.0/24')).toBe(false);
  });

  it('matches the whole internet', () => {
    expect(ipInCidr('8.8.8.8', '0.0.0.0/0')).toBe(true);
    expect(ipInCidr('203.0.113.7', '203.0.113.0/24')).toBe(true);
    expect(ipInCidr('203.0.114.7', '203.0.113.0/24')).toBe(false);
  });

  it('is false for malformed arguments', () => {
    expect(ipInCidr('nope', '10.0.1.0/24')).toBe(false);
    expect(ipInCidr('10.0.1.5', 'nope')).toBe(false);
  });
});

describe('cidrOverlaps', () => {
  it('detects partial and full overlap', () => {
    expect(cidrOverlaps('10.0.1.0/24', '10.0.1.0/25')).toBe(true);
    expect(cidrOverlaps('10.0.1.0/25', '10.0.1.0/24')).toBe(true);
    expect(cidrOverlaps('10.0.1.0/24', '10.0.1.0/24')).toBe(true);
  });

  it('allows disjoint siblings', () => {
    expect(cidrOverlaps('10.0.1.0/24', '10.0.2.0/24')).toBe(false);
    expect(cidrOverlaps('10.0.0.0/25', '10.0.0.128/25')).toBe(false);
  });
});

describe('gateway and usable range', () => {
  it('uses the second address as the gateway, like GCP', () => {
    expect(gatewayAddress('10.0.1.0/24')).toBe('10.0.1.1');
    expect(usableRange('10.0.1.0/24')).toEqual({
      first: parseIpv4('10.0.1.2'),
      last: parseIpv4('10.0.1.254'),
    });
  });

  it('reserves the network, gateway and broadcast addresses', () => {
    const range = usableRange('192.168.0.0/29');
    expect(formatIpv4(range!.first)).toBe('192.168.0.2');
    expect(formatIpv4(range!.last)).toBe('192.168.0.6');
  });
});

describe('isPrivateCidr', () => {
  it('recognises RFC 1918 ranges', () => {
    expect(isPrivateCidr('10.0.1.0/24')).toBe(true);
    expect(isPrivateCidr('172.16.0.0/16')).toBe(true);
    expect(isPrivateCidr('192.168.0.0/16')).toBe(true);
    expect(isPrivateCidr('8.8.8.0/24')).toBe(false);
    expect(isPrivateCidr('203.0.113.0/24')).toBe(false);
  });
});

describe('stableHash', () => {
  it('is deterministic', () => {
    expect(stableHash('10.0.1.10:51000')).toBe(stableHash('10.0.1.10:51000'));
  });

  it('spreads similar inputs across buckets', () => {
    const buckets = new Set<number>();
    for (let i = 0; i < 20; i++) buckets.add(stableHash(`10.0.1.10:${50000 + i}`));
    expect(buckets.size).toBeGreaterThan(10);
  });
});