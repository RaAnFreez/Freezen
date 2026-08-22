const normalizeSlug = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 128);

export async function resolveGetKeyService(env, slug) {
  if (!env?.DB) return { error: 'DATABASE_UNAVAILABLE', status: 503 };
  const normalized = normalizeSlug(slug);
  if (!normalized) return { error: 'INVALID_SLUG', status: 400 };

  const direct = await env.DB.prepare(`SELECT id, name, slug, description, active
    FROM frezen_key_services WHERE slug = ?1 LIMIT 1`).bind(normalized).first();
  if (direct?.active) return { service: direct, requested_slug: normalized, canonical_slug: direct.slug, alias: false };

  try {
    const alias = await env.DB.prepare(`SELECT a.service_id, s.id, s.name, s.slug, s.description, s.active
      FROM frezen_key_service_aliases a
      JOIN frezen_key_services s ON s.id = a.service_id
      WHERE a.slug = ?1 LIMIT 1`).bind(normalized).first();
    if (alias?.active) {
      return { service: alias, requested_slug: normalized, canonical_slug: alias.slug, alias: true };
    }
  } catch {
    // Older D1s may not have the alias table yet; direct slug resolution above
    // remains authoritative and preserves existing deployments.
  }

  return { error: 'SERVICE_NOT_FOUND', status: 404, requested_slug: normalized };
}

export { normalizeSlug };
