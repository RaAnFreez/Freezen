import { encryptKeySecret } from './key-secret.js';

const SESSION_COOKIE = 'frezen_getkey_session';
const NO_STORE = { 'cache-control': 'no-store' };

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE },
});

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function sessionCookie(sessionId) {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Max-Age=${30 * 60}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes = 4) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function makeLicenseKey() {
  return `FREZEN-${randomHex()}-${randomHex()}-${randomHex()}-${randomHex()}`;
}

async function syncDashboardKeyRecord(env, sessionId, licenseId, licenseKey, keyCiphertext) {
  if (!env?.DB || !sessionId || !licenseId || !licenseKey || !env?.FREZEN_MASTER_SECRET) return false;

  const [session, existingRecord] = await Promise.all([
    env.DB.prepare('SELECT id, service_id FROM getkey_public_sessions WHERE id = ?1 LIMIT 1').bind(sessionId).first(),
    env.DB.prepare('SELECT id FROM frezen_key_records WHERE license_id = ?1 LIMIT 1').bind(licenseId).first().catch(() => null),
  ]);
  if (existingRecord?.id) return true;
  if (!session?.service_id) return false;

  const [service, provider] = await Promise.all([
    env.DB.prepare(`SELECT id, owner_id, name, slug, active
      FROM frezen_key_services WHERE id = ?1 LIMIT 1`).bind(session.service_id).first(),
    env.DB.prepare(`SELECT id, name, service_id, active
      FROM frezen_key_providers WHERE service_id = ?1 AND active = 1
      ORDER BY updated_at DESC LIMIT 1`).bind(session.service_id).first(),
  ]);

  if (!service?.owner_id || !service.active || !provider?.id) {
    console.error('GetKey dashboard context unavailable', {
      session_id: sessionId,
      service_id: session.service_id,
      has_owner_id: Boolean(service?.owner_id),
      has_provider: Boolean(provider?.id),
    });
    return false;
  }

  const keyHash = await sha256Hex(licenseKey);
  const ciphertext = keyCiphertext || await encryptKeySecret(env.FREZEN_MASTER_SECRET, licenseKey);
  const recordId = crypto.randomUUID();

  await env.DB.prepare(`UPDATE licenses
    SET license_key_hash = ?1, status = 'active', expires_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?2`).bind(keyHash, licenseId).run();

  await env.DB.prepare(`UPDATE getkey_public_keys
    SET key_hash = ?1, key_ciphertext = ?2
    WHERE session_id = ?3 AND license_id = ?4`).bind(keyHash, ciphertext, sessionId, licenseId).run();

  await env.DB.prepare(`INSERT INTO frezen_key_records
    (id, owner_id, license_id, provider_id, service_id, folder_id, key_name, premium, forever)
    VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, 0, 1)`)
    .bind(
      recordId,
      service.owner_id,
      licenseId,
      provider.id,
      service.id,
      `Get-Key — ${String(service.name || service.slug || 'Service').slice(0, 80)}`,
    ).run();

  await env.DB.prepare('INSERT INTO frezen_key_limits (key_id, max_devices) VALUES (?1, 1)')
    .bind(recordId).run();

  await env.DB.prepare(`UPDATE frezen_key_records
    SET key_secret_ciphertext = ?1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?2`).bind(ciphertext, recordId).run().catch((error) => {
      console.warn('GetKey dashboard secret column unavailable', {
        message: String(error?.message || error),
        key_id: recordId,
      });
    });

  return true;
}

async function issueLicenseWithProductionSchema(env, sessionId) {
  const existing = await env.DB.prepare(
    'SELECT * FROM getkey_public_keys WHERE session_id = ?1 LIMIT 1',
  ).bind(sessionId).first();
  if (existing) return { licenseId: existing.license_id, alreadyIssued: true };

  const licenseKey = makeLicenseKey();
  const keyHash = await sha256Hex(licenseKey);
  const licenseId = crypto.randomUUID();

  // Production licenses schema does not contain product_id.
  await env.DB.prepare(`INSERT INTO licenses
    (id, license_key_hash, user_id, status, created_at, updated_at, expires_at)
    VALUES (?1, ?2, NULL, 'active', datetime('now'), datetime('now'), NULL)`)
    .bind(licenseId, keyHash).run();

  let ciphertext = null;
  if (env.FREZEN_MASTER_SECRET) {
    ciphertext = await encryptKeySecret(env.FREZEN_MASTER_SECRET, licenseKey);
  }

  await env.DB.prepare(`INSERT INTO getkey_public_keys
    (session_id, license_id, key_hash, key_ciphertext, created_at)
    VALUES (?1, ?2, ?3, ?4, datetime('now'))`)
    .bind(sessionId, licenseId, keyHash, ciphertext).run();

  await env.DB.prepare(
    'UPDATE getkey_public_sessions SET issued_license_id = ?1 WHERE id = ?2',
  ).bind(licenseId, sessionId).run();

  if (env.FREZEN_MASTER_SECRET) {
    try {
      await syncDashboardKeyRecord(env, sessionId, licenseId, licenseKey, ciphertext);
    } catch (error) {
      console.error('GetKey dashboard key sync failed', {
        session_id: sessionId,
        license_id: licenseId,
        message: String(error?.message || error),
      });
    }
  }

  return { licenseId, alreadyIssued: false };
}

export async function verifyGetKeyCheckpointCallback(request, env, token) {
  const value = String(token || '').trim();
  if (!/^[A-Za-z0-9]{40,96}$/.test(value)) {
    return json({ error: 'INVALID_VERIFICATION_TOKEN' }, 400);
  }
  if (!env?.DB) return json({ error: 'DATABASE_UNAVAILABLE' }, 503);

  const tokenHash = await sha256Hex(value);
  const sessionId = readCookie(request, SESSION_COOKIE);

  try {
    const row = await env.DB.prepare(`SELECT c.id, c.session_id, c.checkpoint_id, c.status,
      c.token_expires_at, s.service_id, s.expires_at AS session_expires_at
      FROM getkey_public_checkpoints c
      JOIN getkey_public_sessions s ON s.id = c.session_id
      WHERE c.verify_token_hash = ?1 LIMIT 1`).bind(tokenHash).first();

    if (!row) return json({ error: 'VERIFICATION_TOKEN_NOT_FOUND' }, 404);
    if (!sessionId || sessionId !== row.session_id) return json({ error: 'SESSION_MISMATCH' }, 403);
    if (new Date(row.session_expires_at).getTime() <= Date.now()) return json({ error: 'TOKEN_EXPIRED' }, 410);
    if (row.token_expires_at && new Date(row.token_expires_at).getTime() <= Date.now()) return json({ error: 'TOKEN_EXPIRED' }, 410);
    if (row.status === 'passed') return json({ error: 'TOKEN_ALREADY_USED' }, 409);

    const updated = await env.DB.prepare(`UPDATE getkey_public_checkpoints
      SET status = 'passed', verified_at = datetime('now'),
          verify_token_hash = NULL, token_expires_at = NULL, short_url = NULL
      WHERE id = ?1 AND session_id = ?2 AND verify_token_hash = ?3 AND status != 'passed'`)
      .bind(row.id, row.session_id, tokenHash).run();

    if (!updated?.meta?.changes) return json({ error: 'VERIFICATION_RACE' }, 409);

    const rows = await env.DB.prepare(
      'SELECT checkpoint_id, status FROM getkey_public_checkpoints WHERE session_id = ?1 ORDER BY step_index ASC',
    ).bind(row.session_id).all();
    const allPassed = (rows.results || []).length > 0
      && rows.results.every((item) => item.status === 'passed');

    if (allPassed) {
      await issueLicenseWithProductionSchema(env, row.session_id);
    }

    const service = await env.DB.prepare(
      'SELECT slug FROM frezen_key_services WHERE id = ?1 LIMIT 1',
    ).bind(row.service_id).first();
    if (!service?.slug) return json({ error: 'SERVICE_NOT_FOUND' }, 404);

    const location = `/get-key/${encodeURIComponent(service.slug)}?flow=${encodeURIComponent(row.session_id)}&verified=1${allPassed ? '&unlocked=1' : ''}`;
    return new Response(null, {
      status: 302,
      headers: {
        location,
        'set-cookie': sessionCookie(row.session_id),
        ...NO_STORE,
      },
    });
  } catch (error) {
    console.error('GetKey production-schema callback failed', {
      message: String(error?.message || error),
      session_id: sessionId || null,
    });
    return json({ error: 'DATABASE_ERROR' }, 503);
  }
}
