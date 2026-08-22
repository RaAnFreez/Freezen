import {
  startPublicGetKey as startRuntime,
  getPublicGetKeyState as getStateRuntime,
  launchPublicGetKeyCheckpoint as launchRuntime,
  verifyPublicGetKeyCallback as verifyRuntime,
  getPublicGetKeyLicense,
} from './getkey-public-runtime.js';

const SESSION_COOKIE = 'frezen_getkey_session';
const CLAIM_COOKIE_PREFIX = 'frezen_getkey_claim_';
const CLAIM_MAX_AGE = 365 * 24 * 60 * 60;
const NO_STORE = { 'cache-control': 'no-store' };

function safeSlug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'default';
}

function claimCookieName(slug) {
  return `${CLAIM_COOKIE_PREFIX}${safeSlug(slug)}`;
}

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

function persistentClaimCookie(slug, sessionId) {
  return `${claimCookieName(slug)}=${encodeURIComponent(sessionId)}; Max-Age=${CLAIM_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function withCookies(response, cookies) {
  if (!cookies.length) return response;
  const headers = new Headers(response.headers);
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function sessionIdFromLocation(location) {
  try {
    const url = new URL(location, 'https://frezen.invalid');
    return url.searchParams.get('flow') || null;
  } catch {
    return null;
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

async function getClaimedSession(env, slug, request) {
  const claim = readCookie(request, claimCookieName(slug));
  if (!claim) return null;
  const row = await env.DB?.prepare(`SELECT id, service_id, issued_license_id, expires_at
    FROM getkey_public_sessions WHERE id = ?1 LIMIT 1`).bind(claim).first().catch(() => null);
  if (!row?.issued_license_id) return null;
  await extendClaimedSession(env, row.id);
  return row;
}

export async function startPublicGetKey(request, env, slug) {
  const claimed = await getClaimedSession(env, slug, request);
  const effectiveRequest = claimed ? requestWithSession(request, claimed.id) : request;
  const response = await startRuntime(effectiveRequest, env, slug);

  let payload = null;
  try { payload = await response.clone().json(); } catch {}
  const flowId = payload?.flow_id || null;
  const cookies = [];

  if (flowId && payload?.state?.status === 'COMPLETED') {
    await extendClaimedSession(env, flowId);
    cookies.push(persistentSessionCookie(flowId), persistentClaimCookie(slug, flowId));
    return withCookies(response, cookies);
  }

  if (flowId && !claimed) {
    // During an active flow the normal 30-minute runtime session remains authoritative.
    // We do not create a second long-lived claim until a key has actually been issued.
  }

  return response;
}

export async function getPublicGetKeyState(request, env, flowId) {
  const sessionId = readCookie(request, SESSION_COOKIE) || flowId;
  const claimed = readCookie(request, CLAIM_COOKIE_PREFIX);
  const effectiveRequest = requestWithSession(request, sessionId || claimed);
  return getStateRuntime(effectiveRequest, env, flowId);
}

export async function launchPublicGetKeyCheckpoint(request, env, flowId) {
  const sessionId = readCookie(request, SESSION_COOKIE) || flowId;
  const claimed = readCookie(request, CLAIM_COOKIE_PREFIX);
  const effectiveRequest = requestWithSession(request, sessionId || claimed);
  return launchRuntime(effectiveRequest, env, flowId);
}

export async function verifyPublicGetKeyCallback(request, env, token) {
  const response = await verifyRuntime(request, env, token);
  if (response.status < 300 || response.status >= 400) return response;
  const location = response.headers.get('location') || '';
  if (!/unlocked=1(?:&|$)/.test(location)) return response;
  const sessionId = sessionIdFromLocation(location);
  if (!sessionId) return response;

  let slug = null;
  try {
    const url = new URL(location, 'https://frezen.invalid');
    const match = url.pathname.match(/^\/get-key\/([^/]+)$/);
    slug = match ? decodeURIComponent(match[1]) : null;
  } catch {}

  await extendClaimedSession(env, sessionId);
  const cookies = [persistentSessionCookie(sessionId)];
  if (slug) cookies.push(persistentClaimCookie(slug, sessionId));
  return withCookies(response, cookies);
}

export { getPublicGetKeyLicense };
