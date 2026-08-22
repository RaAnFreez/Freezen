import { testSafeLinkUConnection, safelinkuConfigStatus } from './safelinku.js';

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

async function attachCheckpointToProviders(env, ownerId, checkpointId, serviceId = null) {
  const providers = serviceId
    ? await env.DB.prepare(`SELECT id, checkpoints_json FROM frezen_key_providers
        WHERE owner_id = ?1 AND service_id = ?2 AND active = 1`).bind(ownerId, serviceId).all()
    : await env.DB.prepare(`SELECT id, checkpoints_json FROM frezen_key_providers
        WHERE owner_id = ?1 AND active = 1`).bind(ownerId).all();

  const statements = [];
  for (const provider of providers.results || []) {
    let parsed = [];
    try {
      const value = JSON.parse(provider.checkpoints_json || '[]');
      parsed = Array.isArray(value) ? value : [];
    } catch {
      parsed = [];
    }
    const ids = new Set(parsed.map((item) => typeof item === 'string'
      ? item.trim()
      : String(item?.id || item?.checkpoint_id || item?.reference || '').trim()).filter(Boolean));
    if (ids.has(checkpointId)) continue;
    parsed.push(checkpointId);
    statements.push(env.DB.prepare(`UPDATE frezen_key_providers
      SET checkpoints_json = ?1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?2 AND owner_id = ?3`).bind(JSON.stringify(parsed), provider.id, ownerId));
  }
  if (statements.length) await env.DB.batch(statements);
  return statements.length;
}

export async function createDashboardCheckpoint(request, env, access) {
  if (!env?.DB || !access?.user_id) return json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  if (!env?.SAFELINKU_API_KEY) return json({ error: 'SAFELINKU_NOT_CONFIGURED' }, 503);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  const id = clean(body?.checkpoint_id, 128) || crypto.randomUUID();
  const serviceId = clean(body?.service_id, 128) || null;
  const name = clean(body?.name, 100) || `Checkpoint ${new Date().toISOString().slice(0, 10)}`;
  await env.DB.prepare(`INSERT INTO frezen_key_checkpoints
    (id, owner_id, name, type, url, active, metadata_json, created_at, updated_at)
    VALUES (?1,?2,?3,'safelinku',NULL,1,?4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,name=excluded.name,type='safelinku',url=NULL,active=1,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(id, access.user_id, name, JSON.stringify({ generated_by: 'safelinku-runtime', provider: 'safelinku' })).run();
  const attachedProviders = await attachCheckpointToProviders(env, access.user_id, id, serviceId).catch(() => 0);
  return json({
    status: 'ok',
    checkpoint: { id, name, type: 'safelinku', url: null, active: true, generated_by: 'safelinku-runtime' },
    attached_providers: attachedProviders,
  }, 201);
}

export async function deleteDashboardCheckpoint(env, access, id) {
  const result = await env.DB.prepare(`DELETE FROM frezen_key_checkpoints WHERE id = ?1 AND owner_id = ?2 AND type = 'safelinku'`).bind(id, access.user_id).run();
  if (!result?.meta?.changes) return json({ error: 'CHECKPOINT_NOT_FOUND' }, 404);
  return json({ deleted: true });
}

export async function testDashboardSafeLinkU(env) {
  return json(await testSafeLinkUConnection(env));
}
