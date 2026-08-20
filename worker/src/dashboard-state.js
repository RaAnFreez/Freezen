const NO_STORE = { 'cache-control': 'no-store' };

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE },
});

const cleanId = (value, max = 128) => {
  const id = typeof value === 'string' ? value.trim() : '';
  return id && id.length <= max ? id : null;
};

const slugify = (value) => String(value || '').trim().toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 50);

const parseArray = (value) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const checkpointRefs = (value) => {
  const raw = Array.isArray(value) ? value : parseArray(value);
  return [...new Set(raw.map((item) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') return String(item.id || item.checkpoint_id || item.reference || '').trim();
    return '';
  }).filter(Boolean))];
};

const normalizeIdSet = (rows) => new Set((rows || []).map((row) => cleanId(row?.id)).filter(Boolean));

export async function reconcileDashboardState(request, env, access) {
  if (!env?.DB || !access?.user_id) return json({ error: 'DATABASE_UNAVAILABLE' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }

  const services = Array.isArray(body?.services) ? body.services : [];
  const providers = Array.isArray(body?.providers) ? body.providers : [];
  const checkpoints = Array.isArray(body?.checkpoints) ? body.checkpoints : [];
  const ownerId = access.user_id;
  const now = new Date().toISOString();

  const serviceIds = normalizeIdSet(services);
  const providerIds = normalizeIdSet(providers);
  const checkpointIds = normalizeIdSet(checkpoints);

  try {
    // Service is the root of the graph. A provider can only point at a service
    // owned by the current owner. Scripts are disabled when their service is
    // intentionally removed/deactivated from the dashboard.
    for (const service of services) {
      const id = cleanId(service?.id);
      const slug = slugify(service?.slug);
      if (!id || !slug) continue;

      const current = await env.DB.prepare('SELECT id, slug FROM frezen_key_services WHERE id = ?1 AND owner_id = ?2 LIMIT 1')
        .bind(id, ownerId).first();
      if (current?.slug && current.slug !== slug) {
        await env.DB.prepare('INSERT OR IGNORE INTO frezen_key_service_aliases (slug, service_id) VALUES (?1, ?2)')
          .bind(current.slug, id).run();
      }

      await env.DB.prepare(`
        INSERT INTO frezen_key_services
          (id, owner_id, name, slug, description, premium, keyless, keyless_days_json, active, created_at, updated_at)
        VALUES
          (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
           COALESCE((SELECT created_at FROM frezen_key_services WHERE id = ?1), datetime('now')), ?10)
        ON CONFLICT(id) DO UPDATE SET
          owner_id=excluded.owner_id,
          name=excluded.name,
          slug=excluded.slug,
          description=excluded.description,
          premium=excluded.premium,
          keyless=excluded.keyless,
          keyless_days_json=excluded.keyless_days_json,
          active=excluded.active,
          updated_at=excluded.updated_at
      `).bind(
        id,
        ownerId,
        String(service?.name || 'Service').slice(0, 100),
        slug,
        String(service?.description || '').slice(0, 500),
        service?.premium ? 1 : 0,
        service?.keyless ? 1 : 0,
        JSON.stringify(Array.isArray(service?.days) ? service.days : []),
        service?.active === false ? 0 : 1,
        now,
      ).run();
    }

    for (const provider of providers) {
      const id = cleanId(provider?.id);
      const serviceId = cleanId(provider?.service_id);
      if (!id || !serviceId || !serviceIds.has(serviceId)) continue;

      const checkpointList = checkpointRefs(provider?.checkpoints);
      await env.DB.prepare(`
        INSERT INTO frezen_key_providers
          (id, owner_id, service_id, name, type, active, checkpoints_json, settings_json, created_at, updated_at)
        VALUES
          (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
           COALESCE((SELECT created_at FROM frezen_key_providers WHERE id = ?1), datetime('now')), ?9)
        ON CONFLICT(id) DO UPDATE SET
          owner_id=excluded.owner_id,
          service_id=excluded.service_id,
          name=excluded.name,
          type=excluded.type,
          active=excluded.active,
          checkpoints_json=excluded.checkpoints_json,
          settings_json=excluded.settings_json,
          updated_at=excluded.updated_at
      `).bind(
        id,
        ownerId,
        serviceId,
        String(provider?.name || 'Provider').slice(0, 100),
        String(provider?.type || 'safelinku').slice(0, 40),
        provider?.active === false ? 0 : 1,
        JSON.stringify(checkpointList),
        JSON.stringify(provider || {}),
        now,
      ).run();
    }

    for (const checkpoint of checkpoints) {
      const id = cleanId(checkpoint?.id);
      if (!id) continue;
      const reference = typeof checkpoint?.reference === 'string'
        ? checkpoint.reference
        : (typeof checkpoint?.url === 'string' ? checkpoint.url : null);
      await env.DB.prepare(`
        INSERT INTO frezen_key_checkpoints
          (id, owner_id, name, type, url, active, metadata_json, created_at, updated_at)
        VALUES
          (?1, ?2, ?3, ?4, ?5, ?6, ?7,
           COALESCE((SELECT created_at FROM frezen_key_checkpoints WHERE id = ?1), datetime('now')), ?8)
        ON CONFLICT(id) DO UPDATE SET
          owner_id=excluded.owner_id,
          name=excluded.name,
          type=excluded.type,
          url=excluded.url,
          active=excluded.active,
          metadata_json=excluded.metadata_json,
          updated_at=excluded.updated_at
      `).bind(
        id,
        ownerId,
        String(checkpoint?.name || 'Checkpoint').slice(0, 100),
        String(checkpoint?.type || 'safelinku').slice(0, 40),
        reference ? reference.slice(0, 500) : null,
        checkpoint?.active === false ? 0 : 1,
        JSON.stringify(checkpoint || {}),
        now,
      ).run();
    }

    // D1 is authoritative. Anything that existed for this owner but was
    // removed from the dashboard's current state is deactivated server-side.
    // This prevents the old localStorage-only delete behavior from resurrecting
    // deleted records on the next dashboard load.
    const missingServices = await env.DB.prepare(
      `SELECT id FROM frezen_key_services WHERE owner_id = ?1 AND active = 1${serviceIds.size ? ` AND id NOT IN (${[...serviceIds].map(() => '?').join(',')})` : ''}`,
    ).bind(ownerId, ...serviceIds).all();
    const missingServiceIds = (missingServices?.results || []).map((row) => row.id).filter(Boolean);

    if (missingServiceIds.length) {
      await env.DB.prepare(`UPDATE frezen_key_services SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ?1 AND id IN (${missingServiceIds.map(() => '?').join(',')})`)
        .bind(ownerId, ...missingServiceIds).run();
      await env.DB.prepare(`UPDATE frezen_key_providers SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ?1 AND service_id IN (${missingServiceIds.map(() => '?').join(',')})`)
        .bind(ownerId, ...missingServiceIds).run();
      await env.DB.prepare(`UPDATE scripts SET status = 'DISABLED', updated_at = CURRENT_TIMESTAMP WHERE service_id IN (${missingServiceIds.map(() => '?').join(',')})`)
        .bind(...missingServiceIds).run();
    }

    const missingProviders = await env.DB.prepare(
      `SELECT id FROM frezen_key_providers WHERE owner_id = ?1 AND active = 1${providerIds.size ? ` AND id NOT IN (${[...providerIds].map(() => '?').join(',')})` : ''}`,
    ).bind(ownerId, ...providerIds).all();
    const missingProviderIds = (missingProviders?.results || []).map((row) => row.id).filter(Boolean);
    if (missingProviderIds.length) {
      await env.DB.prepare(`UPDATE frezen_key_providers SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ?1 AND id IN (${missingProviderIds.map(() => '?').join(',')})`)
        .bind(ownerId, ...missingProviderIds).run();
    }

    const missingCheckpoints = await env.DB.prepare(
      `SELECT id FROM frezen_key_checkpoints WHERE owner_id = ?1 AND active = 1${checkpointIds.size ? ` AND id NOT IN (${[...checkpointIds].map(() => '?').join(',')})` : ''}`,
    ).bind(ownerId, ...checkpointIds).all();
    const missingCheckpointIds = (missingCheckpoints?.results || []).map((row) => row.id).filter(Boolean);
    if (missingCheckpointIds.length) {
      await env.DB.prepare(`UPDATE frezen_key_checkpoints SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ?1 AND id IN (${missingCheckpointIds.map(() => '?').join(',')})`)
        .bind(ownerId, ...missingCheckpointIds).run();
    }

    return json({
      synced: true,
      canonical: true,
      services: serviceIds.size,
      providers: providerIds.size,
      checkpoints: checkpointIds.size,
      deactivated: {
        services: missingServiceIds.length,
        providers: missingProviderIds.length,
        checkpoints: missingCheckpointIds.length,
      },
    });
  } catch (error) {
    console.error('dashboard state reconcile failed', { owner_id: ownerId, message: String(error?.message || error) });
    return json({ error: 'DATABASE_ERROR' }, 503);
  }
}
