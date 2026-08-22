const NO_STORE = { 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE },
});

async function loadService(env, slug) {
  if (!env?.DB) return { error: 'DATABASE_UNAVAILABLE', status: 503 };
  const normalizedSlug = String(slug || '').trim().toLowerCase();
  if (!normalizedSlug || normalizedSlug.length > 128) return { error: 'INVALID_SLUG', status: 400 };

  const service = await env.DB.prepare(`SELECT id, name, slug, description, active
    FROM frezen_key_services WHERE slug = ?1 LIMIT 1`).bind(normalizedSlug).first();
  if (!service || !service.active) return { error: 'SERVICE_NOT_FOUND', status: 404 };

  const provider = await env.DB.prepare(`SELECT id, name, type, checkpoints_json, active
    FROM frezen_key_providers WHERE service_id = ?1 AND active = 1
    ORDER BY updated_at DESC LIMIT 1`).bind(service.id).first();
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

  const rows = await env.DB.prepare(`SELECT id, name, type, active
    FROM frezen_key_checkpoints WHERE id IN (${checkpointIds.map(() => '?').join(',')})`).bind(...checkpointIds).all();
  const byId = new Map((rows?.results || []).map((row) => [row.id, row]));
  const checkpoints = checkpointIds.map((id, index) => {
    const row = byId.get(id);
    return row?.active ? { id: row.id, name: row.name, type: row.type, step: index + 1 } : null;
  }).filter(Boolean);

  if (!checkpoints.length) return { error: 'CHECKPOINTS_NOT_FOUND', status: 409 };
  return { service, provider, checkpoints };
}

export async function getPublicGetKeyServiceMeta(env, slug) {
  try {
    const result = await loadService(env, slug);
    if (result.error) return json({ error: result.error }, result.status);
    return json({
      service: {
        id: result.service.id,
        name: result.service.name,
        slug: result.service.slug,
        description: result.service.description,
      },
      checkpoint_count: result.checkpoints.length,
      checkpoints: result.checkpoints,
    });
  } catch (error) {
    console.error('GetKey service metadata failed', { message: String(error?.message || error) });
    return json({ error: 'DATABASE_ERROR' }, 503);
  }
}
