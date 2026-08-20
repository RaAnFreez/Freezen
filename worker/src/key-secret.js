const textEncoder = new TextEncoder();

const toBase64 = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

async function digestSecret(secret) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(secret)));
}

async function importKey(secret) {
  if (!secret) throw new Error('MASTER_SECRET_UNAVAILABLE');
  const raw = await digestSecret(secret);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptKeySecret(secret, plaintext) {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(plaintext)));
  return `v1.${toBase64(iv)}.${toBase64(ciphertext)}`;
}

export async function decryptKeySecret(secret, payload) {
  const [version, ivPart, ciphertextPart] = String(payload || '').split('.');
  if (version !== 'v1' || !ivPart || !ciphertextPart) throw new Error('INVALID_KEY_SECRET');
  const key = await importKey(secret);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivPart) }, key, fromBase64(ciphertextPart));
  return new TextDecoder().decode(plaintext);
}

export async function persistKeySecret(env, keyId, plaintext) {
  if (!env?.DB || !env?.FREZEN_MASTER_SECRET) return { stored: false, reason: 'MASTER_SECRET_UNAVAILABLE' };
  try {
    const ciphertext = await encryptKeySecret(env.FREZEN_MASTER_SECRET, plaintext);
    await env.DB.prepare('UPDATE frezen_key_records SET key_secret_ciphertext = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2').bind(ciphertext, keyId).run();
    return { stored: true };
  } catch (error) {
    console.error('key secret persistence failed', { keyId, message: String(error?.message || error) });
    return { stored: false, reason: String(error?.message || 'KEY_SECRET_COLUMN_UNAVAILABLE') };
  }
}

export async function revealKeySecret(env, keyId, ownerId) {
  if (!env?.DB) return { ok: false, error: 'DATABASE_UNAVAILABLE' };
  if (!env?.FREZEN_MASTER_SECRET) return { ok: false, error: 'KEY_SECRET_NOT_CONFIGURED' };
  try {
    const row = await env.DB.prepare(`SELECT k.key_secret_ciphertext
      FROM frezen_key_records k
      WHERE k.id = ?1 AND k.owner_id = ?2
      LIMIT 1`).bind(keyId, ownerId).first();
    if (!row) return { ok: false, error: 'KEY_NOT_FOUND' };
    if (!row.key_secret_ciphertext) return { ok: false, error: 'KEY_SECRET_UNAVAILABLE' };
    try {
      const plaintext = await decryptKeySecret(env.FREZEN_MASTER_SECRET, row.key_secret_ciphertext);
      return { ok: true, plaintext };
    } catch (error) {
      console.error('key secret decrypt failed', { keyId, message: String(error?.message || error) });
      return { ok: false, error: 'KEY_SECRET_INVALID' };
    }
  } catch (error) {
    console.error('key secret lookup failed', { keyId, message: String(error?.message || error) });
    return { ok: false, error: 'KEY_SECRET_UNAVAILABLE' };
  }
}
