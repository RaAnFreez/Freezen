import { describe, expect, it } from 'vitest';
import {
  MAX_INLINE_SCRIPT_ROW_CONTENT_BYTES,
  MAX_VM_OUTPUT_BYTES,
  deleteStoredScriptPayloads,
  resolveScriptPayload,
  storeScriptPayloadPair,
} from './script-payload-storage.js';

function createBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value) { objects.set(key, String(value)); },
    async get(key) {
      if (!objects.has(key)) return null;
      const value = objects.get(key);
      return { async text() { return value; } };
    },
    async delete(key) { objects.delete(key); },
  };
}

describe('Large Lua payload storage', () => {
  it('caps generated VM output at 20 MiB while keeping D1 inline rows conservative', () => {
    expect(MAX_VM_OUTPUT_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_INLINE_SCRIPT_ROW_CONTENT_BYTES).toBeLessThan(2_000_000);
  });

  it('keeps small source/payload pairs inline in D1', async () => {
    const pair = await storeScriptPayloadPair({}, {
      scope: 'scripts',
      fileId: 'small-file',
      source: 'print("ok")',
      payload: '-- protected payload',
    });
    expect(pair.storage).toBe('d1');
    expect(pair.content).toBe('-- protected payload');
    expect(pair.sourceContent).toBe('print("ok")');
  });

  it('stores oversized combined rows in R2 and resolves pointers transparently', async () => {
    const bucket = createBucket();
    const source = 's'.repeat(700_000);
    const payload = 'p'.repeat(900_000);
    const pair = await storeScriptPayloadPair({ SCRIPT_PAYLOADS: bucket }, {
      scope: 'scripts',
      fileId: 'test-file',
      source,
      payload,
    });

    expect(pair.storage).toBe('r2');
    expect(pair.content).toMatch(/^frezen-r2:\/\/frezen\/scripts\/test-file\/[0-9a-f-]+\/payload\.lua$/i);
    expect(pair.sourceContent).toMatch(/^frezen-r2:\/\/frezen\/scripts\/test-file\/[0-9a-f-]+\/source\.lua$/i);
    expect(await resolveScriptPayload({ SCRIPT_PAYLOADS: bucket }, pair.content)).toBe(payload);
    expect(await resolveScriptPayload({ SCRIPT_PAYLOADS: bucket }, pair.sourceContent)).toBe(source);

    await deleteStoredScriptPayloads({ SCRIPT_PAYLOADS: bucket }, pair.content, pair.sourceContent);
    expect(bucket.objects.size).toBe(0);
  });

  it('returns an explicit error when large payload storage has not been configured', async () => {
    await expect(storeScriptPayloadPair({}, {
      scope: 'scripts',
      fileId: 'test-file',
      source: 's'.repeat(700_000),
      payload: 'p'.repeat(700_000),
    })).rejects.toThrow('SCRIPT_PAYLOADS_R2_BINDING_REQUIRED');
  });

  it('rejects missing R2 objects instead of sending a storage pointer as Lua', async () => {
    const pointer = 'frezen-r2://frezen/scripts/test-file/9d5ba4f9-2a45-49b0-a08e-151c998a392d/payload.lua';
    await expect(resolveScriptPayload({ SCRIPT_PAYLOADS: createBucket() }, pointer))
      .rejects.toThrow('SCRIPT_PAYLOAD_MISSING');
  });
});
