/**
 * Simulation speed helper.
 *
 * Every artificial delay in the app is scaled through `getSpeed()` so the
 * SIMULATION_SPEED environment variable has exactly one definition. In the
 * browser `import.meta.env` is used (Vite inlines it at build time); on the
 * server `process.env` is read. The value is clamped to 0.1 - 10 as required.
 */

const MIN_SPEED = 0.1;
const MAX_SPEED = 10;
const DEFAULT_SPEED = 1;

function readRawSpeed(): string | undefined {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return (
    viteEnv?.VITE_SIMULATION_SPEED ??
    viteEnv?.SIMULATION_SPEED ??
    (typeof process !== 'undefined' ? process.env?.SIMULATION_SPEED : undefined)
  );
}

function parseSpeed(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_SPEED;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SPEED;
  return parsed;
}

/** Clamp any number into the supported 0.1 - 10 speed range. */
export function clampSpeed(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_SPEED;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, value));
}

/**
 * Current simulation speed multiplier. 1 = real time, 2 = twice as fast.
 * Values below 1 slow the simulation down; values are clamped to [0.1, 10].
 */
export function getSpeed(): number {
  return clampSpeed(parseSpeed(readRawSpeed()));
}

/**
 * Wait for `baseMs` milliseconds of wall-clock time, scaled by SIMULATION_SPEED.
 * Always yields to the event loop so the UI thread is never blocked.
 */
export function simulateDelay(baseMs: number): Promise<void> {
  const scaled = baseMs / getSpeed();
  return new Promise((resolve) => {
    setTimeout(resolve, scaled);
  });
}

/** Base (unscaled) durations for each simulated lifecycle transition. */
export const DELAYS = {
  vmProvision: 3000,
  loadBalancerProvision: 4000,
  resourceCreate: 1000,
  attach: 1000,
  delete: 1000,
} as const;

/** Base (unscaled) per-hop duration for the packet animation. */
export const PACKET_HOP_DELAY_MS = 600;