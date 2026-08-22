import {
  startPublicGetKey as startRuntime,
  getPublicGetKeyLicense,
  verifyPublicGetKeyCallback as verifyRuntime,
} from './getkey-public-runtime.js';
import { launchGetKeyCheckpointByServiceId } from './getkey-service-id-launch.js';
import { getPublicGetKeyStateByServiceId } from './getkey-service-id-state.js';

const SESSION_COOKIE = 'frezen_getkey_session';
const CLAIM_MAX_AGE = 365 * 24 * 60 * 60;

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

async function extendClaimedSession(env, sessionId) {
  if (!env?.DB || !sessionId) return false;
  const expiresAt = new Date(Date.now() + CLAIM_MAX_AGE * 1000).toISOString();
  const result = await env.DB.prepare(`UPDATE getkey_public_sessions
    SET expires_at = ?1, last_seen_at = datetime('now')
    WHERE id = ?2 AND issued_license_id IS NOT NULL`).bind(expiresAt, sessionId).run().catch(() => null);
  return Boolean(result?.meta?.changes);
}

export async function startPublicGetKey(request, env, slug) {
  const response = await startRuntime(request, env, slug);
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
  return getPublicGetKeyStateByServiceId(requestWithSession(request, readCookie(request, SESSION_COOKIE) || flowId), env, flowId);
}

export async function launchPublicGetKeyCheckpoint(request, env, flowId) {
  const sessionRequest = requestWithSession(request, readCookie(request, SESSION_COOKIE) || flowId);
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
  const extended = await extendClaimedSession(env, sessionId);
  return extended ? withPersistentCookie(response, sessionId) : response;
}

export { getPublicGetKeyLicense };
