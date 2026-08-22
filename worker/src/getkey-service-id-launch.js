import { createSafeLinkUShortLink } from './safelinku.js';

const SESSION_COOKIE = 'frezen_getkey_session';
const TOKEN_TTL_SECONDS = 20 * 60;
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

function futureIso(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function newToken() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getSession(env, sessionId) {
  if (!env?.DB || !sessionId) return null;
  const session = await env.DB.prepare('SELECT * FROM getkey_public_sessions WHERE id = ?1 LIMIT 1').bind(sessionId).first();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare('DELETE FROM getkey_public_sessions WHERE id = ?1').bind(sessionId).run().catch(() => {});
    return null;
  }
  return session;
}

async function loadServiceById(env, serviceId) {
  if (!env?.DB) return { error: 'DATABASE_UNAVAILABLE', status: 503 };
  const service = await env.DB.prepare(`SELECT id, name, slug, description, active
    FROM frezen_key_services WHERE id = ?1 LIMIT 1`).bind(serviceId).first();
  if (!service || !service.active) return { error: 'SERVICE_NOT_FOUND', status: 404 };

  const provider = await env.DB.prepare(`SELECT id, name, type, service_id, checkpoints_json, active
    FROM frezen_key_providers WHERE service_id = ?1 AND active = 1 ORDER BY updated_at DESC LIMIT 1`).bind(service.id).first();
  if (!provider) return { error: 'PROVIDER_NOT_CONFIGURED', status: 409 };

  let checkpointIds = [];
  try {
    const parsed = JSON.parse(provider.checkpoints_json || '[]');
    checkpointIds = [...new Set((Array.isArray(parsed) ? parsed : []).map((item) => {
      if (typeof item === 'string') return item.trim();
      return String(item?.id || item?.checkpoint_id || item?.reference || '').trim();
    }).filter(Boolean))];
  } catch {
    checkpointIds = [];
  }
  if (!checkpointIds.length) return { error: 'CHECKPOINTS_NOT_CONFIGURED', status: 409 };

  const rows = await env.DB.prepare(`SELECT id, name, type, url, active
    FROM frezen_key_checkpoints WHERE id IN (${checkpointIds.map(() => '?').join(',')})`).bind(...checkpointIds).all();
  const byId = new Map((rows?.results || []).map((row) => [row.id, row]));
  const checkpoints = checkpointIds.map((id) => byId.get(id)).filter((row) => row?.active);
  if (!checkpoints.length) return { error: 'CHECKPOINTS_NOT_FOUND', status: 409 };
  return { service, provider, checkpoints };
}

export async function launchGetKeyCheckpointByServiceId(request, env, flowId, jsonMode = false) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId || sessionId !== flowId) return json({ error: 'SESSION_MISMATCH' }, 403);
  const session = await getSession(env, sessionId);
  if (!session) return json({ error: 'FLOW_NOT_FOUND' }, 404);

  const config = await loadServiceById(env, session.service_id);
  if (config.error) return json({ error: config.error }, config.status);

  try {
    const rows = await env.DB.prepare(`SELECT id, step_index, checkpoint_id, status, verify_token_hash, token_expires_at, short_url
      FROM getkey_public_checkpoints WHERE session_id = ?1 ORDER BY step_index ASC`).bind(session.id).all();
    const next = (rows.results || []).find((row) => row.status !== 'passed');
    if (!next) return json({ error: 'FLOW_COMPLETE' }, 409);

    // Reuse an existing unexpired checkpoint URL for this flow instead of
    // generating a different SafeLinkU link on every reload/click.
    if (next.short_url && next.token_expires_at && new Date(next.token_expires_at).getTime() > Date.now()) {
      if (jsonMode) return json({ status: 'ok', url: next.short_url, reused: true });
      return new Response(null, { status: 302, headers: { location: next.short_url, ...NO_STORE } });
    }

    const token = newToken();
    const tokenHash = await sha256Hex(token);
    const expires = futureIso(TOKEN_TTL_SECONDS);
    const callback = new URL('/api/v1/get-key/checkpoint/callback', request.url);
    callback.searchParams.set('token', token);
    const created = await createSafeLinkUShortLink(env, callback.toString(), {
      alias: `frezen-${session.id.slice(0, 8)}-${next.step_index}`,
    });
    if (created.status !== 'ok' || !created.url) {
      return json({
        error: created.error || 'SAFELINKU_LINK_CREATION_FAILED',
        provider: 'safelinku',
        http_status: created.http_status,
      }, created.http_status >= 400 ? Math.min(created.http_status, 503) : 503);
    }

    await env.DB.prepare(`UPDATE getkey_public_checkpoints
      SET verify_token_hash = ?1, token_expires_at = ?2, short_url = ?3
      WHERE id = ?4 AND session_id = ?5 AND status != 'passed'`)
      .bind(tokenHash, expires, created.url, next.id, session.id).run();

    if (jsonMode) return json({ status: 'ok', url: created.url, reused: false });
    return new Response(null, { status: 302, headers: { location: created.url, ...NO_STORE } });
  } catch (error) {
    console.error('GetKey service-id checkpoint launch failed', { message: String(error?.message || error) });
    return json({ error: 'DATABASE_ERROR' }, 503);
  }
}
