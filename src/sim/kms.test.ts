import { describe, it, expect } from 'vitest';
import { createInitialState } from './engine';
import type { SimResult } from './types';

/** Read a result's error code without narrowing every call site by hand. */
const codeOf = (result: SimResult<unknown>): string => (result.ok ? 'OK' : result.code);
import {
  createKeyRing,
  deleteKeyRing,
  createKey,
  setKeyEnabled,
  destroyKey,
  cancelDestruction,
  addKeyVersion,
  setPrimaryVersion,
  encryptWithKey,
  DESTRUCTION_WINDOW_DAYS,
  ALGORITHMS_BY_PURPOSE,
  versionsOf,
  primaryVersionOf,
} from './kms';

function withRing() {
  const created = createKeyRing(createInitialState(), { name: 'app-keys', location: 'us-central1' });
  if (!created.ok) throw new Error(created.message);
  return created.value;
}

describe('KMS key rings', () => {
  it('creates a regional key ring', () => {
    const { keyRing } = withRing();
    expect(keyRing.location).toBe('us-central1');
  });

  it('allows the same ring name in a different location', () => {
    const { state } = withRing();
    const other = createKeyRing(state, { name: 'app-keys', location: 'europe-west1' });
    expect(other.ok).toBe(true);
  });

  it('rejects a duplicate ring in the same location', () => {
    const { state } = withRing();
    const dup = createKeyRing(state, { name: 'app-keys', location: 'us-central1' });
    expect(codeOf(dup)).toBe('DUPLICATE_NAME');
  });

  it('refuses to delete a ring that still holds keys', () => {
    const { state, keyRing } = withRing();
    const key = createKey(state, { keyRingId: keyRing.id, name: 'secret', purpose: 'ENCRYPT_DECRYPT' });
    if (!key.ok) throw new Error(key.message);
    expect(codeOf(deleteKeyRing(key.value.state, keyRing.id))).toBe('DEPENDENCY');
  });

  it('force deletes the ring together with its keys and versions', () => {
    const { state, keyRing } = withRing();
    const key = createKey(state, { keyRingId: keyRing.id, name: 'secret', purpose: 'ENCRYPT_DECRYPT' });
    if (!key.ok) throw new Error(key.message);
    const result = deleteKeyRing(key.value.state, keyRing.id, { cascade: true });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.state.kmsKeyRings).toHaveLength(0);
    expect(result.value.state.kmsKeys).toHaveLength(0);
    expect(result.value.state.kmsKeyVersions).toHaveLength(0);
  });
});

describe('KMS crypto keys', () => {
  it('creates a key with an enabled primary version', () => {
    const { state, keyRing } = withRing();
    const result = createKey(state, { keyRingId: keyRing.id, name: 'secret', purpose: 'ENCRYPT_DECRYPT' });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.key.state).toBe('ENABLED');
    expect(result.value.key.algorithm).toBe(ALGORITHMS_BY_PURPOSE.ENCRYPT_DECRYPT);
    const primary = primaryVersionOf(result.value.state, result.value.key);
    expect(primary?.id).toBe(result.value.version.id);
    expect(primary?.state).toBe('ENABLED');
  });

  it('gives asymmetric keys a signing algorithm by default', () => {
    const { state, keyRing } = withRing();
    const result = createKey(state, { keyRingId: keyRing.id, name: 'signer', purpose: 'ASYMMETRIC_SIGN' });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.key.algorithm).toBe('RSA_SIGN_PKCS1_3072_SHA256');
  });

  it('rejects an algorithm that does not match the purpose', () => {
    const { state, keyRing } = withRing();
    const result = createKey(state, {
      keyRingId: keyRing.id,
      name: 'bad',
      purpose: 'ENCRYPT_DECRYPT',
      algorithm: 'HMAC_SHA256',
    });
    expect(codeOf(result)).toBe('INVALID_ARGUMENT');
  });

  it('schedules the next rotation when a period is set', () => {
    const { state, keyRing } = withRing();
    const result = createKey(state, {
      keyRingId: keyRing.id,
      name: 'rotating',
      purpose: 'ENCRYPT_DECRYPT',
      rotationPeriodDays: 30,
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.key.nextRotationAt).toBeDefined();
  });

  it('rejects a rotation period shorter than a day', () => {
    const { state, keyRing } = withRing();
    const result = createKey(state, {
      keyRingId: keyRing.id,
      name: 'toofast',
      purpose: 'ENCRYPT_DECRYPT',
      rotationPeriodDays: 1,
    });
    expect(codeOf(result)).toBe('INVALID_ARGUMENT');
  });

  it('rejects a duplicate key name inside one ring', () => {
    const { state, keyRing } = withRing();
    const first = createKey(state, { keyRingId: keyRing.id, name: 'secret', purpose: 'ENCRYPT_DECRYPT' });
    if (!first.ok) throw new Error(first.message);
    const dup = createKey(first.value.state, { keyRingId: keyRing.id, name: 'secret', purpose: 'ENCRYPT_DECRYPT' });
    expect(codeOf(dup)).toBe('DUPLICATE_NAME');
  });
});

describe('KMS key state transitions', () => {
  function withKey() {
    const { state, keyRing } = withRing();
    const key = createKey(state, { keyRingId: keyRing.id, name: 'secret', purpose: 'ENCRYPT_DECRYPT' });
    if (!key.ok) throw new Error(key.message);
    return key.value;
  }

  it('disables a key and its primary version together', () => {
    const { state, key } = withKey();
    const result = setKeyEnabled(state, key.id, false);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.state.kmsKeys[0].state).toBe('DISABLED');
    expect(result.value.state.kmsKeyVersions[0].state).toBe('DISABLED');
  });

  it('refuses to encrypt with a disabled key', () => {
    const { state, key } = withKey();
    const disabled = setKeyEnabled(state, key.id, false);
    if (!disabled.ok) throw new Error(disabled.message);
    const result = encryptWithKey(disabled.value.state, key.id);
    expect(codeOf(result)).toBe('INVALID_STATE');
  });

  it('encrypts successfully when enabled', () => {
    const { state, key } = withKey();
    const result = encryptWithKey(state, key.id);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.ciphertext).toContain(key.id);
  });

  it('refuses to encrypt with a signing key', () => {
    const { state, keyRing } = withRing();
    const key = createKey(state, { keyRingId: keyRing.id, name: 'signer', purpose: 'ASYMMETRIC_SIGN' });
    if (!key.ok) throw new Error(key.message);
    expect(codeOf(encryptWithKey(key.value.state, key.value.key.id))).toBe('INVALID_STATE');
  });

  it('warns when toggling to the state it is already in', () => {
    const { state, key } = withKey();
    expect(codeOf(setKeyEnabled(state, key.id, true))).toBe('INVALID_STATE');
  });

  it('destroys a key in two phases, with a recovery window', () => {
    const { state, key } = withKey();
    const destroyed = destroyKey(state, key.id);
    if (!destroyed.ok) throw new Error(destroyed.message);
    const pending = destroyed.value.state.kmsKeys[0];
    expect(pending.state).toBe('PENDING_DESTRUCTION');
    expect(pending.primaryVersionId).toBeUndefined();
    // The key is unusable immediately, not only after the window.
    expect(codeOf(encryptWithKey(destroyed.value.state, key.id))).toBe('INVALID_STATE');
  });

  it('schedules destruction exactly one window out', () => {
    const { state, key } = withKey();
    const destroyed = destroyKey(state, key.id);
    if (!destroyed.ok) throw new Error(destroyed.message);
    const at = new Date(destroyed.value.state.kmsKeys[0].destroyScheduledAt!).getTime();
    const days = (at - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(DESTRUCTION_WINDOW_DAYS - 1);
    expect(days).toBeLessThanOrEqual(DESTRUCTION_WINDOW_DAYS);
  });

  it('recovers a key inside the destruction window', () => {
    const { state, key } = withKey();
    const destroyed = destroyKey(state, key.id);
    if (!destroyed.ok) throw new Error(destroyed.message);
    const recovered = cancelDestruction(destroyed.value.state, key.id);
    if (!recovered.ok) throw new Error(recovered.message);
    const restored = recovered.value.state.kmsKeys[0];
    expect(restored.state).toBe('ENABLED');
    expect(restored.destroyScheduledAt).toBeUndefined();
    expect(encryptWithKey(recovered.value.state, key.id).ok).toBe(true);
  });

  it('refuses to cancel destruction for a healthy key', () => {
    const { state, key } = withKey();
    expect(codeOf(cancelDestruction(state, key.id))).toBe('INVALID_STATE');
  });

  it('refuses to double-destroy', () => {
    const { state, key } = withKey();
    const destroyed = destroyKey(state, key.id);
    if (!destroyed.ok) throw new Error(destroyed.message);
    expect(codeOf(destroyKey(destroyed.value.state, key.id))).toBe('INVALID_STATE');
  });
});

describe('KMS versions', () => {
  function withKey() {
    const { state, keyRing } = withRing();
    const key = createKey(state, { keyRingId: keyRing.id, name: 'secret', purpose: 'ENCRYPT_DECRYPT' });
    if (!key.ok) throw new Error(key.message);
    return key.value;
  }

  it('adds a version without promoting it', () => {
    const { state, key } = withKey();
    const added = addKeyVersion(state, key.id);
    if (!added.ok) throw new Error(added.message);
    expect(versionsOf(added.value.state, key.id)).toHaveLength(2);
    // New versions do not encrypt until they are made primary.
    expect(added.value.state.kmsKeys[0].primaryVersionId).not.toBe(added.value.version.id);
  });

  it('promotes a version to primary, changing the ciphertext', () => {
    const { state, key } = withKey();
    const added = addKeyVersion(state, key.id);
    if (!added.ok) throw new Error(added.message);
    const before = encryptWithKey(added.value.state, key.id);
    if (!before.ok) throw new Error(before.message);
    const promoted = setPrimaryVersion(added.value.state, key.id, added.value.version.id);
    if (!promoted.ok) throw new Error(promoted.message);
    const after = encryptWithKey(promoted.value.state, key.id);
    if (!after.ok) throw new Error(after.message);
    expect(after.value.ciphertext).not.toBe(before.value.ciphertext);
  });

  it('refuses a version from a different key', () => {
    const { state, keyRing } = withRing();
    const a = createKey(state, { keyRingId: keyRing.id, name: 'a', purpose: 'ENCRYPT_DECRYPT' });
    if (!a.ok) throw new Error(a.message);
    // Build from a's result, otherwise b reuses a's ids and the check is a no-op.
    const b = createKey(a.value.state, { keyRingId: keyRing.id, name: 'b', purpose: 'ENCRYPT_DECRYPT' });
    if (!b.ok) throw new Error(b.message);
    expect(b.value.key.id).not.toBe(a.value.key.id);
    const extra = addKeyVersion(b.value.state, b.value.key.id);
    if (!extra.ok) throw new Error(extra.message);
    const result = setPrimaryVersion(extra.value.state, a.value.key.id, extra.value.version.id);
    expect(codeOf(result)).toBe('NOT_FOUND');
  });

  it('refuses to add a version to a disabled key', () => {
    const { state, key } = withKey();
    const disabled = setKeyEnabled(state, key.id, false);
    if (!disabled.ok) throw new Error(disabled.message);
    expect(codeOf(addKeyVersion(disabled.value.state, key.id))).toBe('INVALID_STATE');
  });
});