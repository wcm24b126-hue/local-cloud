import type { SimState, KmsKey, KmsKeyRing, KmsKeyVersion, SimResult } from './types';
import { ok, err } from './types';
import { nextId, logEvent, validateName, duplicateName } from './engine';

/* ------------------------------------------------------------------ */
/* algorithms                                                          */
/* ------------------------------------------------------------------ */

/** Default algorithm per purpose, matching what KMS offers for symmetric keys. */
export const ALGORITHMS_BY_PURPOSE: Record<KmsKey['purpose'], string> = {
  ENCRYPT_DECRYPT: 'GOOGLE_SYMMETRIC_ENCRYPTION',
  ASYMMETRIC_SIGN: 'RSA_SIGN_PKCS1_3072_SHA256',
  MAC: 'HMAC_SHA256',
};

const ALGORITHM_PURPOSE: Record<string, KmsKey['purpose']> = {
  GOOGLE_SYMMETRIC_ENCRYPTION: 'ENCRYPT_DECRYPT',
  AES_256_GCM: 'ENCRYPT_DECRYPT',
  GOOGLE_SYMMETRIC_ENCRYPTION_KMS: 'ENCRYPT_DECRYPT',
  RSA_SIGN_PKCS1_3072_SHA256: 'ASYMMETRIC_SIGN',
  RSA_SIGN_PKCS1_4096_SHA256: 'ASYMMETRIC_SIGN',
  EC_SIGN_P384_SHA384: 'ASYMMETRIC_SIGN',
  HMAC_SHA256: 'MAC',
};

/** KMS destroys keys 7 days after a destroy request, never instantly. */
export const DESTRUCTION_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

export function findKeyRing(state: SimState, id: string): KmsKeyRing | undefined {
  return state.kmsKeyRings.find((r) => r.id === id);
}

export function findKey(state: SimState, id: string): KmsKey | undefined {
  return state.kmsKeys.find((k) => k.id === id);
}

export function versionsOf(state: SimState, keyId: string): KmsKeyVersion[] {
  return state.kmsKeyVersions.filter((v) => v.keyId === keyId);
}

export function primaryVersionOf(state: SimState, key: KmsKey): KmsKeyVersion | undefined {
  return key.primaryVersionId
    ? state.kmsKeyVersions.find((v) => v.id === key.primaryVersionId)
    : undefined;
}

/* ------------------------------------------------------------------ */
/* key rings                                                           */
/* ------------------------------------------------------------------ */

export function createKeyRing(
  state: SimState,
  input: { name: string; location: string }
): SimResult<{ state: SimState; keyRing: KmsKeyRing }> {
  const problem = validateName(input.name, 'key ring');
  if (problem) return problem;
  // Key ring names are only unique per location, not per project.
  const scoped = state.kmsKeyRings.filter((r) => r.location === input.location);
  if (duplicateName(scoped, input.name, 'key ring')) {
    return err(
      'DUPLICATE_NAME',
      `Key ring "${input.name}" already exists in ${input.location}.`,
      'Pick a different name, or use another location.'
    );
  }
  const idResult = nextId(state, 'kmskr');
  const keyRing: KmsKeyRing = {
    id: idResult.id,
    name: input.name,
    location: input.location,
    createdAt: new Date().toISOString(),
  };
  const next = {
    ...idResult.state,
    kmsKeyRings: [...idResult.state.kmsKeyRings, keyRing],
  };
  return ok(
    { state: logEvent(next, 'kms.keyRings.create', `keyRings/${input.location}/${input.name}`, 'SUCCESS'), keyRing },
    `Key ring "${input.name}" created in ${input.location}.`
  );
}

export function deleteKeyRing(
  state: SimState,
  id: string,
  options: { cascade?: boolean } = {}
): SimResult<{ state: SimState }> {
  const keyRing = findKeyRing(state, id);
  if (!keyRing) return err('NOT_FOUND', 'Key ring not found.', 'Refresh the list; it may already be deleted.');
  const keys = state.kmsKeys.filter((k) => k.keyRingId === id);
  if (keys.length > 0 && !options.cascade) {
    return err(
      'DEPENDENCY',
      `Key ring "${keyRing.name}" still contains ${keys.length} key(s).`,
      'Delete the keys first, or use a force delete to remove the ring and its keys.'
    );
  }
  const keyIds = new Set(keys.map((k) => k.id));
  const next: SimState = {
    ...state,
    kmsKeyRings: state.kmsKeyRings.filter((r) => r.id !== id),
    kmsKeys: state.kmsKeys.filter((k) => !keyIds.has(k.id)),
    kmsKeyVersions: state.kmsKeyVersions.filter((v) => !keyIds.has(v.keyId)),
  };
  return ok(
    { state: logEvent(next, 'kms.keyRings.delete', `keyRings/${keyRing.location}/${keyRing.name}`, 'SUCCESS', `${keys.length} key(s) removed`) },
    `Key ring "${keyRing.name}" deleted.`
  );
}

/* ------------------------------------------------------------------ */
/* crypto keys                                                         */
/* ------------------------------------------------------------------ */

export function createKey(
  state: SimState,
  input: {
    keyRingId: string;
    name: string;
    purpose: KmsKey['purpose'];
    algorithm?: string;
    protectionLevel?: KmsKey['protectionLevel'];
    rotationPeriodDays?: number;
  }
): SimResult<{ state: SimState; key: KmsKey; version: KmsKeyVersion }> {
  const keyRing = findKeyRing(state, input.keyRingId);
  if (!keyRing) return err('NOT_FOUND', 'Key ring not found.', 'Create a key ring first.');
  const problem = validateName(input.name, 'key');
  if (problem) return problem;
  const scoped = state.kmsKeys.filter((k) => k.keyRingId === input.keyRingId);
  if (duplicateName(scoped, input.name, 'key')) {
    return err('DUPLICATE_NAME', `Key "${input.name}" already exists in this key ring.`, 'Pick a different key name.');
  }

  const algorithm = input.algorithm ?? ALGORITHMS_BY_PURPOSE[input.purpose];
  if (ALGORITHM_PURPOSE[algorithm] !== input.purpose) {
    return err(
      'INVALID_ARGUMENT',
      `Algorithm ${algorithm} cannot be used for ${input.purpose}.`,
      'Pick an algorithm that matches the key purpose.'
    );
  }
  const rotationPeriodDays = input.rotationPeriodDays ?? 0;
  if (rotationPeriodDays !== 0 && rotationPeriodDays < 24) {
    return err('INVALID_ARGUMENT', 'Rotation period must be 0 (no auto-rotation) or at least 24 hours.', 'Set a longer rotation period, or 0 to disable rotation.');
  }

  const idResult = nextId(state, 'kms');
  const versionIdResult = nextId(idResult.state, 'kmsver');
  const createdAt = new Date().toISOString();

  // A new key is created with one enabled primary version.
  const version: KmsKeyVersion = {
    id: versionIdResult.id,
    keyId: idResult.id,
    state: 'ENABLED',
    algorithm,
    createdAt,
  };
  const key: KmsKey = {
    id: idResult.id,
    keyRingId: input.keyRingId,
    name: input.name,
    purpose: input.purpose,
    algorithm,
    state: 'ENABLED',
    protectionLevel: input.protectionLevel ?? 'SOFTWARE',
    primaryVersionId: version.id,
    rotationPeriodDays,
    nextRotationAt: rotationPeriodDays > 0 ? new Date(Date.now() + rotationPeriodDays * DAY_MS).toISOString() : undefined,
    createdAt,
  };

  let next: SimState = {
    ...versionIdResult.state,
    kmsKeys: [...versionIdResult.state.kmsKeys, key],
    kmsKeyVersions: [...versionIdResult.state.kmsKeyVersions, version],
  };
  next = logEvent(next, 'kms.cryptoKeys.create', `keyRings/${keyRing.location}/${keyRing.name}/cryptoKeys/${input.name}`, 'SUCCESS', algorithm);
  return ok({ state: next, key, version }, `Key "${input.name}" created with an enabled primary version.`);
}

export function setKeyEnabled(
  state: SimState,
  id: string,
  enabled: boolean
): SimResult<{ state: SimState }> {
  const key = findKey(state, id);
  if (!key) return err('NOT_FOUND', 'Key not found.', 'Refresh the list; it may already be deleted.');
  if (key.state === 'DESTROYED') {
    return err('INVALID_STATE', `Key "${key.name}" is destroyed.`, 'Destroyed keys cannot be re-enabled. Create a new key instead.');
  }
  if (key.state === 'PENDING_DESTRUCTION') {
    return err(
      'INVALID_STATE',
      `Key "${key.name}" is scheduled for destruction.`,
      `Cancel destruction within ${DESTRUCTION_WINDOW_DAYS} days to keep using it.`
    );
  }
  if ((key.state === 'ENABLED') === enabled) {
    return err('INVALID_STATE', `Key "${key.name}" is already ${key.state.toLowerCase()}.`, 'No change needed.');
  }

  const next: SimState = {
    ...state,
    kmsKeys: state.kmsKeys.map((k) =>
      k.id === id
        ? { ...k, state: enabled ? ('ENABLED' as const) : ('DISABLED' as const) }
        : k
    ),
    // Disabling a key disables its primary version too, so crypto calls fail.
    kmsKeyVersions: state.kmsKeyVersions.map((v) =>
      v.keyId === id && v.id === key.primaryVersionId && enabled === false
        ? { ...v, state: 'DISABLED' as const }
        : v
    ),
  };
  return ok(
    { state: logEvent(next, 'kms.cryptoKeys.updateVersion', `keys/${key.name}`, 'SUCCESS', enabled ? 'enabled' : 'disabled') },
    `Key "${key.name}" ${enabled ? 'enabled' : 'disabled'}. ${enabled ? '' : 'Encrypt and decrypt calls now fail.'}`
  );
}

/** Destroy is two-phase, with a recovery window, exactly like the real service. */
export function destroyKey(state: SimState, id: string): SimResult<{ state: SimState }> {
  const key = findKey(state, id);
  if (!key) return err('NOT_FOUND', 'Key not found.', 'Refresh the list; it may already be deleted.');
  if (key.state === 'DESTROYED' || key.state === 'PENDING_DESTRUCTION') {
    return err('INVALID_STATE', `Key "${key.name}" is already destroyed or pending destruction.`, 'Create a new key if you need to encrypt again.');
  }
  const next: SimState = {
    ...state,
    kmsKeys: state.kmsKeys.map((k) =>
      k.id === id
        ? {
            ...k,
            state: 'PENDING_DESTRUCTION' as const,
            destroyScheduledAt: new Date(Date.now() + DESTRUCTION_WINDOW_DAYS * DAY_MS).toISOString(),
            primaryVersionId: undefined,
          }
        : k
    ),
    kmsKeyVersions: state.kmsKeyVersions.map((v) =>
      v.keyId === id ? { ...v, state: 'PENDING_DESTRUCTION' as const } : v
    ),
  };
  return ok(
    { state: logEvent(next, 'kms.cryptoKeys.destroy', `keys/${key.name}`, 'SUCCESS', `destruction in ${DESTRUCTION_WINDOW_DAYS} days`) },
    `Key "${key.name}" will be destroyed in ${DESTRUCTION_WINDOW_DAYS} days. Cancel destruction to keep it.`
  );
}

export function cancelDestruction(state: SimState, id: string): SimResult<{ state: SimState }> {
  const key = findKey(state, id);
  if (!key) return err('NOT_FOUND', 'Key not found.', 'Refresh the list; it may already be deleted.');
  if (key.state !== 'PENDING_DESTRUCTION') {
    return err('INVALID_STATE', `Key "${key.name}" is not pending destruction.`, 'Only keys in that state can be recovered.');
  }
  // Recovery re-enables the latest version, which is why the window exists.
  const latest = state.kmsKeyVersions.filter((v) => v.keyId === id).at(-1);
  const next: SimState = {
    ...state,
    kmsKeys: state.kmsKeys.map((k) =>
      k.id === id
        ? {
            ...k,
            state: 'ENABLED' as const,
            destroyScheduledAt: undefined,
            primaryVersionId: latest?.id,
          }
        : k
    ),
    kmsKeyVersions: state.kmsKeyVersions.map((v) =>
      v.keyId === id ? { ...v, state: 'ENABLED' as const } : v
    ),
  };
  return ok(
    { state: logEvent(next, 'kms.cryptoKeys.restore', `keys/${key.name}`, 'SUCCESS') },
    `Destruction cancelled for "${key.name}". The key is enabled again.`
  );
}

export function addKeyVersion(
  state: SimState,
  id: string
): SimResult<{ state: SimState; version: KmsKeyVersion }> {
  const key = findKey(state, id);
  if (!key) return err('NOT_FOUND', 'Key not found.', 'Refresh the list; it may already be deleted.');
  if (key.state !== 'ENABLED') {
    return err('INVALID_STATE', `Key "${key.name}" is ${key.state.toLowerCase()}.`, 'Enable the key before adding a version.');
  }
  const idResult = nextId(state, 'kmsver');
  const version: KmsKeyVersion = {
    id: idResult.id,
    keyId: id,
    state: 'ENABLED',
    algorithm: key.algorithm,
    createdAt: new Date().toISOString(),
  };
  const next = { ...idResult.state, kmsKeyVersions: [...idResult.state.kmsKeyVersions, version] };
  return ok(
    { state: logEvent(next, 'kms.cryptoKeys.createVersion', `keys/${key.name}/versions`, 'SUCCESS'), version },
    `New version added to "${key.name}". Promote it to primary to start using it.`
  );
}

export function setPrimaryVersion(
  state: SimState,
  keyId: string,
  versionId: string
): SimResult<{ state: SimState }> {
  const key = findKey(state, keyId);
  if (!key) return err('NOT_FOUND', 'Key not found.', 'Refresh the list; it may already be deleted.');
  const version = state.kmsKeyVersions.find((v) => v.id === versionId && v.keyId === keyId);
  if (!version) return err('NOT_FOUND', 'Key version not found.', 'Pick a version belonging to this key.');
  if (key.state !== 'ENABLED') {
    return err('INVALID_STATE', `Key "${key.name}" is ${key.state.toLowerCase()}.`, 'Enable the key before changing the primary version.');
  }
  if (version.state === 'DESTROYED' || version.state === 'PENDING_DESTRUCTION') {
    return err('INVALID_STATE', 'That version cannot be primary.', 'Add a new version instead.');
  }
  const next: SimState = {
    ...state,
    kmsKeys: state.kmsKeys.map((k) =>
      k.id === keyId ? { ...k, primaryVersionId: versionId } : k
    ),
    kmsKeyVersions: state.kmsKeyVersions.map((v) =>
      v.keyId === keyId && v.state === 'ENABLED' ? v : v
    ),
  };
  return ok(
    { state: logEvent(next, 'kms.cryptoKeys.setPrimary', `keys/${key.name}`, 'SUCCESS', versionId) },
    `Version ${versionId} is now primary for "${key.name}".`
  );
}

export function encryptWithKey(
  state: SimState,
  id: string
): SimResult<{ state: SimState; ciphertext: string }> {
  const key = findKey(state, id);
  if (!key) return err('NOT_FOUND', 'Key not found.', 'Refresh the list; it may already be deleted.');
  if (key.purpose !== 'ENCRYPT_DECRYPT') {
    return err('INVALID_STATE', `Key "${key.name}" is a ${key.purpose} key.`, 'Only ENCRYPT_DECRYPT keys can encrypt data.');
  }
  if (key.state !== 'ENABLED' || !key.primaryVersionId) {
    return err(
      'INVALID_STATE',
      `Key "${key.name}" cannot be used for encryption.`,
      'Enable the key and make sure it has an enabled primary version.'
    );
  }
  const ciphertext = `localcloud-enc-${key.id}-${key.primaryVersionId}`;
  return ok({ state: state, ciphertext }, `Encrypted with "${key.name}" using primary version ${key.primaryVersionId}.`);
}

export function deleteKeyRingForceNote(): string {
  return 'Deleting a key ring with a force option also destroys every key inside it.';
}