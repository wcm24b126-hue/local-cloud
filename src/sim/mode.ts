/**
 * Simulation-only mode guard.
 *
 * The lab never launches containers or executes shell commands. This module
 * centralises that guarantee so the ENABLE_* flags are read in exactly one
 * place, and any attempt to enable real execution is ignored with a warning
 * instead of silently doing nothing.
 */

function readFlag(name: string): string | undefined {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return (
    viteEnv?.[`VITE_${name}`] ??
    viteEnv?.[name] ??
    (typeof process !== 'undefined' ? process.env?.[name] : undefined)
  );
}

function flag(name: string, fallback: boolean): boolean {
  const raw = readFlag(name);
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
}

let warned = false;

/**
 * Docker execution is permanently disabled. If ENABLE_DOCKER_BACKEND is set to
 * true the user is told once that the simulator ignores it, because the lab is
 * data and algorithms only.
 */
export function isDockerBackendEnabled(): boolean {
  if (readFlag('ENABLE_DOCKER_BACKEND') === 'true' && !warned) {
    warned = true;
    console.warn(
      '[LocalCloud] ENABLE_DOCKER_BACKEND is ignored: the networking lab runs in simulation-only mode and never launches containers.'
    );
  }
  return false;
}

/** Whether the simulated Cloud Shell terminal is available. Defaults to true. */
export function isCloudShellEnabled(): boolean {
  return flag('ENABLE_CLOUD_SHELL', true);
}

/** Whether the guided lab and sample-network helpers are available. Defaults to true. */
export function isLabEnabled(): boolean {
  return flag('ENABLE_LAB', true);
}