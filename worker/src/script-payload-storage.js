export const SCRIPT_PAYLOAD_POINTER_PREFIX = 'frezen-r2://';

// D1 limits a text value or a full row to 2,000,000 bytes. Keep the two large
// Lua fields comfortably below that cap when combined with the row's metadata.
export const MAX_INLINE_SCRIPT_ROW_CONTENT_BYTES = 1_200_000;
export const MAX_VM_OUTPUT_BYTES = 20 * 1024 * 1024;

const encoder = new TextEncoder();
const validKey = /^frezen\/(?:scripts|delivery)\/[A-Za-z0-9_-]+\/[0-9a-f-]+\/(?:payload|source)\.lua$/i;

export function isR2ScriptPayload(value) {
  return typeof value === 'string' && value.startsWith(SCRIPT_PAYLOAD_POINTER_PREFIX);
}

function pointerFor(key) {
  return SCRIPT_PAYLOAD_POINTER_PREFIX + key;
}

function keyFromPointer(value) {
  if (!isR2ScriptPayload(value)) return null;
  const key = value.slice(SCRIPT_PAYLOAD_POINTER_PREFIX.length);
  if (!validKey.test(key)) throw new Error('INVALID_SCRIPT_PAYLOAD_POINTER');
  return key;
}

export function scriptPayloadR2Keys(...values) {
  return [...new Set(values.map(keyFromPointer).filter(Boolean))];
}

export async function resolveScriptPayload(env, value) {
  const key = keyFromPointer(value);
  if (!key) return value ?? '';
  if (!env?.SCRIPT_PAYLOADS || typeof env.SCRIPT_PAYLOADS.get !== 'function') {
    throw new Error('SCRIPT_PAYLOADS_R2_BINDING_REQUIRED');
  }
  const object = await env.SCRIPT_PAYLOADS.get(key);
  if (!object) throw new Error('SCRIPT_PAYLOAD_MISSING');
  return object.text();
}

export async function deleteStoredScriptPayloads(env, ...values) {
  const keys = scriptPayloadR2Keys(...values);
  if (!keys.length || !env?.SCRIPT_PAYLOADS || typeof env.SCRIPT_PAYLOADS.delete !== 'function') return;
  await Promise.all(keys.map(async (key) => { try { await env.SCRIPT_PAYLOADS.delete(key); } catch {} }));
}

/**
 * Store output/source inline only when their combined encoded size is safe for
 * D1. Larger pairs are stored as R2 objects, and short opaque pointers stay in D1.
 * The caller must clean up returned pointers if its subsequent D1 write fails.
 */
export async function storeScriptPayloadPair(env, { scope, fileId, source, payload }) {
  const sourceText = String(source ?? '');
  const payloadText = String(payload ?? '');
  const sourceBytes = encoder.encode(sourceText).byteLength;
  const payloadBytes = encoder.encode(payloadText).byteLength;

  if (sourceBytes + payloadBytes <= MAX_INLINE_SCRIPT_ROW_CONTENT_BYTES) {
    return {
      content: payloadText,
      sourceContent: sourceText,
      storage: 'd1',
      sourceBytes,
      payloadBytes,
    };
  }

  if (!env?.SCRIPT_PAYLOADS || typeof env.SCRIPT_PAYLOADS.put !== 'function') {
    throw new Error('SCRIPT_PAYLOADS_R2_BINDING_REQUIRED');
  }
  if (!['scripts', 'delivery'].includes(scope)) throw new Error('INVALID_SCRIPT_PAYLOAD_SCOPE');
  if (!/^[A-Za-z0-9_-]+$/.test(String(fileId ?? ''))) throw new Error('INVALID_SCRIPT_PAYLOAD_ID');

  const base = `frezen/${scope}/${fileId}/${crypto.randomUUID()}`;
  const payloadKey = `${base}/payload.lua`;
  const sourceKey = `${base}/source.lua`;

  try {
    await env.SCRIPT_PAYLOADS.put(payloadKey, payloadText, {
      httpMetadata: { contentType: 'text/x-lua; charset=utf-8' },
      customMetadata: { kind: 'protected-payload', scope, fileId },
    });
    await env.SCRIPT_PAYLOADS.put(sourceKey, sourceText, {
      httpMetadata: { contentType: 'text/x-lua; charset=utf-8' },
      customMetadata: { kind: 'original-source', scope, fileId },
    });
  } catch (error) {
    try { await env.SCRIPT_PAYLOADS.delete(payloadKey); } catch {}
    try { await env.SCRIPT_PAYLOADS.delete(sourceKey); } catch {}
    throw error;
  }

  return {
    content: pointerFor(payloadKey),
    sourceContent: pointerFor(sourceKey),
    storage: 'r2',
    sourceBytes,
    payloadBytes,
  };
}
