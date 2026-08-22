import {
  startPublicGetKey as startRuntime,
  getPublicGetKeyLicense,
  verifyPublicGetKeyCallback as verifyRuntime,
} from './getkey-public-runtime.js';
import { launchGetKeyCheckpointByServiceId } from './getkey-service-id-launch.js';
import { getPublicGetKeyStateByServiceId } from './getkey-service-id-state.js';
import { encryptKeySecret } from './key-secret.js';

const SESSION_COOKIE = 'frezen_getkey_session';
const CLAIM_MAX_AGE = 24 * 60 * 60;

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function requestWithSession(request, sessionId) {
  if (!sessionId) return request;
  const headers = new Headers(request.headers);
  const cookies = headers.get('cookie') || '';
  const parts = cookies.split(';').map((part) => part.trim()).filter(Boolean).filter((part) => !part.startsWith(`${SESSION_COOKIE}=`));
  parts.push(`${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`);
  headers.set('cookie', parts.join('; '));
  return new Request(request, { headers });
}

function persistentSessionCookie(sessionId) {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Max-Age=${CLAIM_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function withPersistentCookie(response, sessionId) {
  const headers = new Headers(response.headers);
  headers.delete('set-cookie');
  headers.append('set-cookie', persistentSessionCookie(sessionId));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withNextCheckpoint(response, payload) {
  const flowId = payload?.flow_id;
  const nextId = payload?.state?.next_checkpoint_id;
  if (!flowId || !nextId || payload?.state?.status === 'COMPLETED') return response;
  const row = (payload.checkpoints || []).find((item) => item?.checkpoint_id === nextId);
  if (!row) return response;
  const body = JSON.stringify({
    ...payload,
    next_checkpoint: {
      checkpoint_id: row.checkpoint_id,
      name: row.name,
      type: row.type,
      step: row.step,
      launch_path: `/api/v1/get-key/flow/${encodeURIComponent(flowId)}/launch`,
    },
  });
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function sessionIdFromLocation(location) {
  try {
    return new URL(location, 'https://frezen.invalid').searchParams.get('flow') || null;
  } catch {
    return null;
  }
}

function randomHex(bytes = 4) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function makeFrezenKey() {
  return `FREZEN-${randomHex()}-${randomHex()}-${randomHex()}-${randomHex()}`;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function syncIssuedLicenseToDashboard(env, sessionId) {
  if (!env?.DB || !sessionId || !env?.FREZEN_MASTER_SECRET) return false;
  try {
    const [session, keyRow] = await Promise.all([
      env.DB.prepare('SELECT id, service_id, issued_license_id FROM getkey_public_sessions WHERE id = ?1 LIMIT 1').bind(sessionId).first(),
      env.DB.prepare('SELECT license_id, key_ciphertext FROM getkey_public_keys WHERE session_id = ?1 LIMIT 1').bind(sessionId).first(),
    ]);
    if (!session?.service_id || !keyRow?.license_id) return false;

    const existingRecord = await env.DB.prepare('SELECT id FROM frezen_key_records WHERE license_id = ?1 LIMIT 1').bind(keyRow.license_id).first().catch(() => null);
    if (existingRecord?.id) return true;

    const [service, provider] = await Promise.all([
      env.DB.prepare(`SELECT id, owner_id, name, slug, active FROM frezen_key_services WHERE id = ?1 LIMIT 1`).bind(session.service_id).first(),
      env.DB.prepare(`SELECT id, name, service_id, active FROM frezen_key_providers WHERE service_id = ?1 AND active = 1 ORDER BY updated_at DESC LIMIT 1`).bind(session.service_id).first(),
    ]);
    if (!service?.owner_id || !service.active || !provider?.id) return false;

    const licenseKey = makeFrezenKey();
    const keyHash = await sha256Hex(licenseKey);
    const ciphertext = await encryptKeySecret(env.FREZEN_MASTER_SECRET, licenseKey);
    const expiresAt = new Date(Date.now() + CLAIM_MAX_AGE * 1000).toISOString();

    await env.DB.prepare(`UPDATE licenses
      SET license_key_hash = ?1, status = 'active', expires_at = ?2, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?3`).bind(keyHash, expiresAt, keyRow.license_id).run();
    await env.DB.prepare(`UPDATE getkey_public_keys
      SET key_hash = ?1, key_ciphertext = ?2
      WHERE session_id = ?3 AND license_id = ?4`).bind(keyHash, ciphertext, sessionId, keyRow.license_id).run();

    const recordId = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO frezen_key_records
      (id, owner_id, license_id, provider_id, service_id, folder_id, key_name, premium, forever)
      VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, 0, 0)`)
      .bind(recordId, service.owner_id, keyRow.license_id, provider.id, service.id, `Get-Key — ${String(service.name || service.slug || 'Service').slice(0, 80)}`).run();
    await env.DB.prepare('INSERT INTO frezen_key_limits (key_id, max_devices) VALUES (?1, 1)').bind(recordId).run();

    await env.DB.prepare(`UPDATE frezen_key_records
      SET key_secret_ciphertext = ?1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?2`).bind(ciphertext, recordId).run().catch((error) => {
      console.warn('Get-Key dashboard secret column unavailable', { message: String(error?.message || error) });
    });

    return true;
  } catch (error) {
    console.error('Get-Key dashboard license sync failed', { sessionId, message: String(error?.message || error) });
    return false;
  }
}

async function extendClaimedSession(env, sessionId) {
  if (!env?.DB || !sessionId) return false;
  const expiresAt = new Date(Date.now() + CLAIM_MAX_AGE * 1000).toISOString();
  const result = await env.DB.prepare(`UPDATE getkey_public_sessions
    SET expires_at = ?1, last_seen_at = datetime('now')
    WHERE id = ?2 AND issued_license_id IS NOT NULL`).bind(expiresAt, sessionId).run().catch(() => null);
  return Boolean(result?.meta?.changes);
}

async function resolveServiceForStart(env, slug) {
  if (!env?.DB) return { error: 'DATABASE_UNAVAILABLE', status: 503 };
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized || normalized.length > 128) return { error: 'INVALID_SERVICE_SLUG', status: 400 };

  const direct = await env.DB.prepare(`SELECT id, name, slug, description, active
    FROM frezen_key_services WHERE slug = ?1 LIMIT 1`).bind(normalized).first();
  if (direct?.active) return direct;

  const alias = await env.DB.prepare(`SELECT service_id FROM frezen_key_service_aliases
    WHERE slug = ?1 LIMIT 1`).bind(normalized).first();
  if (!alias?.service_id) return { error: 'SERVICE_NOT_FOUND', status: 404 };

  const canonical = await env.DB.prepare(`SELECT id, name, slug, description, active
    FROM frezen_key_services WHERE id = ?1 LIMIT 1`).bind(alias.service_id).first();
  if (!canonical?.active) return { error: 'SERVICE_NOT_FOUND', status: 404 };
  return canonical;
}

export async function startPublicGetKey(request, env, slug) {
  const service = await resolveServiceForStart(env, slug);
  if (service?.error) return new Response(JSON.stringify({ error: service.error }), {
    status: service.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

  const response = await startRuntime(request, env, service.slug);
  let payload = null;
  try { payload = await response.clone().json(); } catch {}
  const nextResponse = withNextCheckpoint(response, payload);
  const flowId = payload?.flow_id || null;
  if (flowId && payload?.state?.status === 'COMPLETED') {
    const extended = await extendClaimedSession(env, flowId);
    if (extended) return withPersistentCookie(nextResponse, flowId);
  }
  return nextResponse;
}

export async function getPublicGetKeyState(request, env, flowId) {
  return getPublicGetKeyStateByServiceId(requestWithSession(request, flowId), env, flowId);
}

export async function launchPublicGetKeyCheckpoint(request, env, flowId) {
  const sessionRequest = requestWithSession(request, flowId);
  const jsonMode = new URL(request.url).searchParams.get('json') === '1';
  return launchGetKeyCheckpointByServiceId(sessionRequest, env, flowId, jsonMode);
}

export async function verifyPublicGetKeyCallback(request, env, token) {
  const response = await verifyRuntime(request, env, token);
  if (response.status < 300 || response.status >= 400) return response;
  const location = response.headers.get('location') || '';
  if (!/unlocked=1(?:&|$)/.test(location)) return response;
  const sessionId = sessionIdFromLocation(location);
  if (!sessionId) return response;

  await syncIssuedLicenseToDashboard(env, sessionId);
  const extended = await extendClaimedSession(env, sessionId);
  return extended ? withPersistentCookie(response, sessionId) : response;
}

export { getPublicGetKeyLicense };
