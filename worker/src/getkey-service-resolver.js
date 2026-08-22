export async function resolveGetKeyService(env, slug) {
  if (!env?.DB) return { error: 'DATABASE_UNAVAILABLE', status: 503 };
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized || normalized.length > 128) return { error: 'INVALID_SERVICE_SLUG', status: 400 };

  const direct = await env.DB.prepare(`SELECT id, name, slug, description, active
    FROM frezen_key_services WHERE slug = ?1 LIMIT 1`).bind(normalized).first();
  if (direct?.active) return { service: direct, requestedSlug: normalized, canonicalSlug: direct.slug, via: 'direct' };

  const alias = await env.DB.prepare(`SELECT service_id FROM frezen_key_service_aliases
    WHERE slug = ?1 LIMIT 1`).bind(normalized).first();
  if (!alias?.service_id) return { error: 'SERVICE_NOT_FOUND', status: 404 };

  const canonical = await env.DB.prepare(`SELECT id, name, slug, description, active
    FROM frezen_key_services WHERE id = ?1 LIMIT 1`).bind(alias.service_id).first();
  if (!canonical?.active) return { error: 'SERVICE_NOT_FOUND', status: 404 };
  return { service: canonical, requestedSlug: normalized, canonicalSlug: canonical.slug, via: 'alias' };
}
