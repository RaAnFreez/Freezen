import { createSafeLinkUShortLink, testSafeLinkUConnection, safelinkuConfigStatus } from './safelinku.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const clean = (value, max = 120) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : '';
};

export async function safelinkuDashboardStatus(env) {
  return json({ provider: 'safelinku', ...safelinkuConfigStatus(env), secret_source: 'worker_secret' });
}

export async function listDashboardCheckpoints(env, access) {
  if (!env?.DB || !access?.user_id) return json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  const rows = await env.DB.prepare(`SELECT id, name, type, url, active, metadata_json, created_at, updated_at
    FROM frezen_key_checkpoints WHERE owner_id = ?1 AND type = 'safelinku' ORDER BY updated_at DESC`)
    .bind(access.user_id).all();
  return json({ checkpoints: rows.results || [] });
}

export async function createDashboardCheckpoint(request, env, access) {
  if (!env?.DB || !access?.user_id) return json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  const id = clean(body?.checkpoint_id, 128) || crypto.randomUUID();
  const name = clean(body?.name, 100) || `Checkpoint ${new Date().toISOString().slice(0, 10)}`;
  const result = await createSafeLinkUShortLink(env, new URL(`/api/v1/get-key/checkpoint/callback?checkpoint_id=${encodeURIComponent(id)}`, request.url).toString(), { alias: `frezen-${id.slice(0, 40)}` });
  if (result.status !== 'ok' || !result.url) return json({ error: result.error || 'SAFELINKU_LINK_CREATION_FAILED', provider: 'safelinku', http_status: result.http_status }, result.http_status >= 400 ? Math.min(result.http_status, 503) : 503);
  await env.DB.prepare(`INSERT INTO frezen_key_checkpoints
    (id, owner_id, name, type, url, active, metadata_json, created_at, updated_at)
    VALUES (?1,?2,?3,'safelinku',?4,1,?5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,name=excluded.name,type='safelinku',url=excluded.url,active=1,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(id, access.user_id, name, result.url, JSON.stringify({ generated_by: 'safelinku-api', provider: 'safelinku' })).run();
  return json({ status: 'ok', checkpoint: { id, name, type: 'safelinku', url: result.url, active: true, generated_by: 'safelinku-api' } }, 201);
}

export async function deleteDashboardCheckpoint(env, access, id) {
  const result = await env.DB.prepare(`DELETE FROM frezen_key_checkpoints WHERE id = ?1 AND owner_id = ?2 AND type = 'safelinku'`).bind(id, access.user_id).run();
  if (!result?.meta?.changes) return json({ error: 'CHECKPOINT_NOT_FOUND' }, 404);
  return json({ deleted: true });
}

export async function testDashboardSafeLinkU(env) {
  return json(await testSafeLinkUConnection(env));
}
