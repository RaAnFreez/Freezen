import { encryptKeySecret, decryptKeySecret } from './key-secret.js';
import { createSafeLinkUShortLink, testSafeLinkUConnection } from './safelinku.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function clean(value, max = 120) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : null;
}

async function getIntegration(env, ownerId, id) {
  return env.DB.prepare(`SELECT id, owner_id, name, salt, api_key_ciphertext, active, created_at, updated_at
    FROM safelinku_integrations WHERE id = ?1 AND owner_id = ?2 LIMIT 1`).bind(id, ownerId).first();
}

async function decryptIntegrationKey(env, row) {
  if (!env?.FREZEN_MASTER_SECRET) throw new Error('MASTER_SECRET_UNAVAILABLE');
  return decryptKeySecret(env.FREZEN_MASTER_SECRET, row.api_key_ciphertext);
}

export async function listSafeLinkUIntegrations(env, access) {
  if (!env?.DB || !access?.user_id) return json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  const rows = await env.DB.prepare(`SELECT id, name, salt, active, created_at, updated_at
    FROM safelinku_integrations WHERE owner_id = ?1 ORDER BY updated_at DESC`).bind(access.user_id).all();
  return json({ integrations: rows.results || [] });
}

export async function createSafeLinkUIntegration(request, env, access) {
  if (!env?.DB || !access?.user_id) return json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  const name = clean(body.name, 80);
  const apiKey = clean(body.api_key, 512);
  const salt = clean(body.salt, 128);
  if (!name || !apiKey || !salt) return json({ error: 'NAME_API_KEY_SALT_REQUIRED' }, 400);
  if (!env.FREZEN_MASTER_SECRET) return json({ error: 'MASTER_SECRET_UNAVAILABLE' }, 503);
  const id = crypto.randomUUID();
  const encrypted = await encryptKeySecret(env.FREZEN_MASTER_SECRET, apiKey);
  await env.DB.prepare(`INSERT INTO safelinku_integrations
    (id, owner_id, name, salt, api_key_ciphertext, active)
    VALUES (?1, ?2, ?3, ?4, ?5, 1)`)
    .bind(id, access.user_id, name, salt, encrypted).run();
  return json({ id, name, salt, active: true, key_configured: true }, 201);
}

export async function updateSafeLinkUIntegration(request, env, access, id) {
  const current = await getIntegration(env, access.user_id, id);
  if (!current) return json({ error: 'INTEGRATION_NOT_FOUND' }, 404);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  const name = clean(body.name, 80) || current.name;
  const salt = clean(body.salt, 128) || current.salt;
  const apiKey = clean(body.api_key, 512);
  let ciphertext = current.api_key_ciphertext;
  if (apiKey) {
    if (!env.FREZEN_MASTER_SECRET) return json({ error: 'MASTER_SECRET_UNAVAILABLE' }, 503);
    ciphertext = await encryptKeySecret(env.FREZEN_MASTER_SECRET, apiKey);
  }
  await env.DB.prepare(`UPDATE safelinku_integrations
    SET name = ?1, salt = ?2, api_key_ciphertext = ?3, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?4 AND owner_id = ?5`).bind(name, salt, ciphertext, id, access.user_id).run();
  return json({ id, name, salt, active: Boolean(current.active), key_configured: true });
}

export async function deleteSafeLinkUIntegration(env, access, id) {
  const result = await env.DB.prepare('DELETE FROM safelinku_integrations WHERE id = ?1 AND owner_id = ?2').bind(id, access.user_id).run();
  if (!result?.meta?.changes) return json({ error: 'INTEGRATION_NOT_FOUND' }, 404);
  await env.DB.prepare('UPDATE frezen_key_checkpoints SET safelinku_integration_id = NULL WHERE owner_id = ?1 AND safelinku_integration_id = ?2').bind(access.user_id, id).run().catch(() => {});
  return json({ deleted: true });
}

export async function testSafeLinkUIntegration(env, access, id) {
  const row = await getIntegration(env, access.user_id, id);
  if (!row) return json({ error: 'INTEGRATION_NOT_FOUND' }, 404);
  try {
    const apiKey = await decryptIntegrationKey(env, row);
    const result = await testSafeLinkUConnection({ ...env, SAFELINKU_API_KEY: apiKey });
    return json({ integration_id: id, ...result });
  } catch (error) {
    return json({ error: String(error?.message || 'INTEGRATION_KEY_UNAVAILABLE') }, 503);
  }
}

export async function listSafeLinkUCheckpoints(env, access) {
  if (!env?.DB || !access?.user_id) return json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  const rows = await env.DB.prepare(`SELECT c.id, c.name, c.type, c.url, c.active, c.safelinku_integration_id,
      i.name AS integration_name
    FROM frezen_key_checkpoints c
    LEFT JOIN safelinku_integrations i ON i.id = c.safelinku_integration_id AND i.owner_id = c.owner_id
    WHERE c.owner_id = ?1 AND c.type = 'safelinku'
    ORDER BY c.updated_at DESC`).bind(access.user_id).all();
  return json({ checkpoints: rows.results || [] });
}

export async function createSafeLinkUCheckpointDefinition(request, env, access, integrationId) {
  const integration = await getIntegration(env, access.user_id, integrationId);
  if (!integration || !integration.active) return json({ error: 'INTEGRATION_NOT_FOUND' }, 404);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  const id = clean(body.checkpoint_id, 128) || crypto.randomUUID();
  const name = clean(body.name, 100) || `Checkpoint ${new Date().toISOString().slice(0, 10)}`;
  await env.DB.prepare(`INSERT INTO frezen_key_checkpoints
    (id, owner_id, name, type, url, active, metadata_json, safelinku_integration_id, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'safelinku', NULL, 1, ?4, ?5, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,name=excluded.name,type='safelinku',active=1,metadata_json=excluded.metadata_json,safelinku_integration_id=excluded.safelinku_integration_id,updated_at=datetime('now')`)
    .bind(id, access.user_id, name, JSON.stringify({ generated_by: 'safelinku-integration', integration_id: integrationId }), integrationId).run();
  return json({ status: 'ok', checkpoint: { id, name, type: 'safelinku', url: null, safelinku_integration_id: integrationId, integration_name: integration.name } }, 201);
}

export async function deleteSafeLinkUCheckpoint(env, access, checkpointId) {
  const result = await env.DB.prepare(`DELETE FROM frezen_key_checkpoints
    WHERE id = ?1 AND owner_id = ?2 AND type = 'safelinku'`).bind(checkpointId, access.user_id).run();
  if (!result?.meta?.changes) return json({ error: 'CHECKPOINT_NOT_FOUND' }, 404);
  await env.DB.prepare(`UPDATE frezen_key_providers SET checkpoints_json = '[]', updated_at = CURRENT_TIMESTAMP
    WHERE owner_id = ?1 AND checkpoints_json LIKE ?2`).bind(access.user_id, `%${checkpointId}%`).run().catch(() => {});
  return json({ deleted: true });
}
