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

async function getSession(env, sessionId) {
  if (!env?.DB || !sessionId) return null;
  const session = await env.DB.prepare('SELECT * FROM getkey_public_sessions WHERE id = ?1 LIMIT 1').bind(sessionId).first();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare('DELETE FROM getkey_public_sessions WHERE id = ?1').bind(sessionId).run().catch(() => {});
    return null;
  }
  await env.DB.prepare("UPDATE getkey_public_sessions SET last_seen_at = datetime('now') WHERE id = ?1").bind(sessionId).run().catch(() => {});
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

async function buildCheckpointRows(env, sessionId, checkpoints) {
  for (let i = 0; i < checkpoints.length; i += 1) {
    await env.DB.prepare(`INSERT OR IGNORE INTO getkey_public_checkpoints
      (id, session_id, step_index, checkpoint_id, status, created_at)
      VALUES (?1, ?2, ?3, ?4, 'pending', datetime('now'))`)
      .bind(crypto.randomUUID(), sessionId, i + 1, checkpoints[i].id).run();
  }
  return env.DB.prepare(`SELECT id, session_id, step_index, checkpoint_id, status, verify_token_hash, token_expires_at, short_url, verified_at
    FROM getkey_public_checkpoints WHERE session_id = ?1 ORDER BY step_index ASC`).bind(sessionId).all();
}

function publicState(session, checkpointRows) {
  const rows = checkpointRows?.results || checkpointRows || [];
  const completed = rows.filter((row) => row.status === 'passed');
  const next = rows.find((row) => row.status !== 'passed') || null;
  return {
    session_id: session.id,
    status: next ? 'PENDING' : 'COMPLETED',
    total: rows.length,
    passed_count: completed.length,
    current_step: next?.step_index || rows.length,
    next_checkpoint_id: next?.checkpoint_id || null,
    expires_at: session.expires_at,
    completed: completed.map((row) => row.checkpoint_id),
  };
}

export async function getPublicGetKeyStateByServiceId(request, env, flowId) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId || sessionId !== flowId) return json({ error: 'SESSION_MISMATCH' }, 403);
  const session = await getSession(env, sessionId);
  if (!session) return json({ error: 'FLOW_NOT_FOUND' }, 404);

  const config = await loadServiceById(env, session.service_id);
  if (config.error) return json({ error: config.error }, config.status);

  try {
    const rows = await buildCheckpointRows(env, session.id, config.checkpoints);
    const state = publicState(session, rows);
    const items = rows.results || [];
    const next = items.find((row) => row.status !== 'passed');
    const names = new Map(config.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.name]));
    return json({
      flow_id: session.id,
      state,
      checkpoints: items.map((row) => ({
        checkpoint_id: row.checkpoint_id,
        name: names.get(row.checkpoint_id) || row.checkpoint_id,
        status: row.status === 'passed' ? 'COMPLETED' : 'PENDING',
        step: row.step_index,
        has_active_link: Boolean(row.short_url && row.status !== 'passed'),
        link_expires_at: row.token_expires_at,
      })),
      next_checkpoint: next ? {
        checkpoint_id: next.checkpoint_id,
        name: names.get(next.checkpoint_id) || next.checkpoint_id,
        launch_path: `/api/v1/get-key/flow/${encodeURIComponent(flowId)}/launch`,
      } : null,
    });
  } catch (error) {
    console.error('GetKey service-id state failed', { message: String(error?.message || error) });
    return json({ error: 'DATABASE_ERROR' }, 503);
  }
}
