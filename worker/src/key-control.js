const MAX_NAME = 100;
const MAX_FOLDER = 80;
const MAX_MINUTES = 3650 * 24 * 60;

const safeText = (value, max = MAX_NAME) => String(value ?? '').trim().slice(0, max);
const jsonResponse = (body, status = 200, requestId = crypto.randomUUID(), headers = {}) => new Response(JSON.stringify({ ...body, request_id: requestId }), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

const hashText = async (value) => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const randomHex = (bytes = 4) => {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
};

const makeKey = () => `FREZEN-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}`;

export async function ensureKeyControlSchema(env) {
  if (!env?.DB) throw new Error('DATABASE_UNAVAILABLE');
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS frezen_key_folders (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(owner_id, name)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS frezen_key_records (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      license_id TEXT NOT NULL UNIQUE,
      provider_id TEXT NOT NULL,
      service_id TEXT,
      folder_id TEXT,
      key_name TEXT,
      premium INTEGER NOT NULL DEFAULT 0,
      forever INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS frezen_key_limits (
      key_id TEXT PRIMARY KEY,
      max_devices INTEGER NOT NULL DEFAULT 1 CHECK (max_devices > 0 AND max_devices <= 100),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (key_id) REFERENCES frezen_key_records(id) ON DELETE CASCADE
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_frezen_key_records_owner ON frezen_key_records(owner_id, created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_frezen_key_records_provider ON frezen_key_records(provider_id, created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_frezen_key_records_service ON frezen_key_records(service_id, created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_frezen_key_folders_owner ON frezen_key_folders(owner_id, name)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_frezen_key_limits_updated ON frezen_key_limits(updated_at)'),
  ]);
}

async function licenseColumns(env) {
  const result = await env.DB.prepare('PRAGMA table_info(licenses)').all();
  return new Set((result?.results || []).map((row) => String(row.name)));
}

async function createLicenseRecord(env, { expiresAt, productId = null }) {
  const licenseKey = makeKey();
  const keyHash = await hashText(licenseKey);
  const licenseId = crypto.randomUUID();
  const columns = await licenseColumns(env);
  const values = {
    id: licenseId,
    license_key_hash: keyHash,
    product_id: productId,
    user_id: null,
    status: 'active',
    expires_at: expiresAt,
  };
  const allowed = ['id', 'license_key_hash', 'product_id', 'user_id', 'status', 'expires_at'];
  const selected = allowed.filter((column) => columns.has(column));
  if (!selected.includes('id') || !selected.includes('license_key_hash')) throw new Error('LICENSE_SCHEMA_INCOMPATIBLE');
  await env.DB.prepare(`INSERT INTO licenses (${selected.join(', ')}) VALUES (${selected.map((_, i) => `?${i + 1}`).join(', ')})`)
    .bind(...selected.map((column) => values[column])).run();
  return { licenseId, licenseKey };
}

async function getProvider(env, ownerId, providerId) {
  return env.DB.prepare('SELECT id, name, type, service_id, active FROM frezen_key_providers WHERE id = ?1 AND owner_id = ?2 LIMIT 1').bind(providerId, ownerId).first();
}

async function getService(env, ownerId, serviceId) {
  return env.DB.prepare('SELECT id, name, slug, active FROM frezen_key_services WHERE id = ?1 AND owner_id = ?2 LIMIT 1').bind(serviceId, ownerId).first();
}

async function getFolder(env, ownerId, folderId) {
  return env.DB.prepare('SELECT id, name FROM frezen_key_folders WHERE id = ?1 AND owner_id = ?2 LIMIT 1').bind(folderId, ownerId).first();
}

export async function keyControlOptions(env, requestId, auth) {
  try {
    await ensureKeyControlSchema(env);
    const [providers, services, folders] = await Promise.all([
      env.DB.prepare('SELECT id, name, type, service_id FROM frezen_key_providers WHERE owner_id = ?1 AND active = 1 ORDER BY name COLLATE NOCASE').bind(auth.user_id).all(),
      env.DB.prepare('SELECT id, name, slug FROM frezen_key_services WHERE owner_id = ?1 AND active = 1 ORDER BY name COLLATE NOCASE').bind(auth.user_id).all(),
      env.DB.prepare('SELECT id, name FROM frezen_key_folders WHERE owner_id = ?1 ORDER BY name COLLATE NOCASE').bind(auth.user_id).all(),
    ]);
    return jsonResponse({ providers: providers.results || [], services: services.results || [], folders: folders.results || [] }, 200, requestId);
  } catch (error) {
    return jsonResponse({ error: 'DATABASE_ERROR', message: String(error?.message || 'Unable to load key options') }, 503, requestId);
  }
}

export async function createKeyFolder(request, env, requestId, auth) {
  if (!auth?.user_id) return jsonResponse({ error: 'SESSION_AUTH_REQUIRED' }, 401, requestId);
  let body = {};
  try { body = await request.json(); } catch { return jsonResponse({ error: 'INVALID_JSON' }, 400, requestId); }
  const name = safeText(body?.name, MAX_FOLDER);
  if (!name) return jsonResponse({ error: 'INVALID_FOLDER_NAME' }, 400, requestId);
  try {
    await ensureKeyControlSchema(env);
    const existing = await env.DB.prepare('SELECT id, name FROM frezen_key_folders WHERE owner_id = ?1 AND name = ?2 COLLATE NOCASE LIMIT 1').bind(auth.user_id, name).first();
    if (existing) return jsonResponse({ folder: existing, created: false }, 200, requestId);
    const folder = { id: crypto.randomUUID(), name };
    await env.DB.prepare('INSERT INTO frezen_key_folders (id, owner_id, name) VALUES (?1, ?2, ?3)').bind(folder.id, auth.user_id, folder.name).run();
    return jsonResponse({ folder, created: true }, 201, requestId);
  } catch (error) {
    return jsonResponse({ error: 'DATABASE_ERROR', message: String(error?.message || 'Unable to create folder') }, 503, requestId);
  }
}

export async function listKeys(request, env, requestId, auth) {
  if (!auth?.user_id) return jsonResponse({ error: 'SESSION_AUTH_REQUIRED' }, 401, requestId);
  const url = new URL(request.url);
  const page = Math.max(Number.parseInt(url.searchParams.get('page') || '1', 10), 1);
  const pageSize = Math.min(Math.max(Number.parseInt(url.searchParams.get('page_size') || '20', 10), 1), 100);
  const q = safeText(url.searchParams.get('q'), 128);
  const providerId = safeText(url.searchParams.get('provider_id'), 128);
  const serviceId = safeText(url.searchParams.get('service_id'), 128);
  const folderId = safeText(url.searchParams.get('folder_id'), 128);
  const status = safeText(url.searchParams.get('status'), 32).toLowerCase();

  try {
    await ensureKeyControlSchema(env);
    const filters = ['k.owner_id = ?1'];
    const binds = [auth.user_id];
    if (q) {
      const idx = binds.length + 1;
      filters.push(`(k.id LIKE ?${idx} OR k.key_name LIKE ?${idx} OR p.name LIKE ?${idx} OR s.name LIKE ?${idx} OR f.name LIKE ?${idx} OR l.id LIKE ?${idx})`);
      binds.push(`%${q}%`);
    }
    if (providerId) { const idx = binds.length + 1; filters.push(`k.provider_id = ?${idx}`); binds.push(providerId); }
    if (serviceId) { const idx = binds.length + 1; filters.push(`k.service_id = ?${idx}`); binds.push(serviceId); }
    if (folderId) { const idx = binds.length + 1; filters.push(`k.folder_id = ?${idx}`); binds.push(folderId); }
    if (status) { const idx = binds.length + 1; filters.push(`LOWER(l.status) = ?${idx}`); binds.push(status); }

    const where = filters.join(' AND ');
    const count = await env.DB.prepare(`SELECT COUNT(*) AS total
      FROM frezen_key_records k
      JOIN licenses l ON l.id = k.license_id
      LEFT JOIN frezen_key_providers p ON p.id = k.provider_id
      LEFT JOIN frezen_key_services s ON s.id = k.service_id
      LEFT JOIN frezen_key_folders f ON f.id = k.folder_id
      WHERE ${where}`).bind(...binds).first();
    const total = Number(count?.total || 0);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;
    const limitIndex = binds.length + 1;
    const offsetIndex = binds.length + 2;
    const rows = await env.DB.prepare(`SELECT k.id, k.license_id, k.provider_id, k.service_id, k.folder_id, k.key_name, k.premium, k.forever,
      k.created_at, k.updated_at, l.status, l.expires_at,
      COALESCE(d.max_devices, 1) AS max_devices,
      p.name AS provider_name, p.type AS provider_type, s.name AS service_name, s.slug AS service_slug,
      f.name AS folder_name
      FROM frezen_key_records k
      JOIN licenses l ON l.id = k.license_id
      LEFT JOIN frezen_key_limits d ON d.key_id = k.id
      LEFT JOIN frezen_key_providers p ON p.id = k.provider_id
      LEFT JOIN frezen_key_services s ON s.id = k.service_id
      LEFT JOIN frezen_key_folders f ON f.id = k.folder_id
      WHERE ${where}
      ORDER BY k.created_at DESC
      LIMIT ?${limitIndex} OFFSET ?${offsetIndex}`).bind(...binds, pageSize, offset).all();
    return jsonResponse({ keys: rows.results || [], pagination: { page: safePage, page_size: pageSize, total, total_pages: totalPages } }, 200, requestId);
  } catch (error) {
    return jsonResponse({ error: 'DATABASE_ERROR', message: String(error?.message || 'Unable to load keys') }, 503, requestId);
  }
}

export async function createKey(request, env, requestId, auth) {
  if (!auth?.user_id) return jsonResponse({ error: 'SESSION_AUTH_REQUIRED' }, 401, requestId);
  let body = {};
  try { body = await request.json(); } catch { return jsonResponse({ error: 'INVALID_JSON' }, 400, requestId); }

  const providerId = safeText(body?.provider_id, 128);
  const serviceId = safeText(body?.service_id, 128) || null;
  const folderId = safeText(body?.folder_id, 128) || null;
  const keyName = safeText(body?.key_name, MAX_NAME) || null;
  const premium = Boolean(body?.premium);
  const forever = Boolean(body?.forever);
  const maxDevices = Number(body?.max_devices ?? 1);
  const days = Number(body?.days ?? 0);
  const hours = Number(body?.hours ?? 0);
  const minutes = Number(body?.minutes ?? 0);

  if (!providerId) return jsonResponse({ error: 'PROVIDER_REQUIRED' }, 400, requestId);
  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 100) return jsonResponse({ error: 'INVALID_MAX_DEVICES' }, 400, requestId);
  if (![days, hours, minutes].every(Number.isFinite) || days < 0 || hours < 0 || minutes < 0) return jsonResponse({ error: 'INVALID_VALIDITY' }, 400, requestId);

  const totalMinutes = Math.floor(days * 24 * 60 + hours * 60 + minutes);
  if (!forever && (totalMinutes < 1 || totalMinutes > MAX_MINUTES)) return jsonResponse({ error: 'INVALID_VALIDITY' }, 400, requestId);

  try {
    await ensureKeyControlSchema(env);
    const provider = await getProvider(env, auth.user_id, providerId);
    if (!provider || !provider.active) return jsonResponse({ error: 'PROVIDER_NOT_FOUND' }, 404, requestId);
    if (serviceId) {
      const service = await getService(env, auth.user_id, serviceId);
      if (!service || !service.active) return jsonResponse({ error: 'SERVICE_NOT_FOUND' }, 404, requestId);
      if (provider.service_id && provider.service_id !== service.id) return jsonResponse({ error: 'PROVIDER_SERVICE_MISMATCH' }, 409, requestId);
    }
    if (folderId && !await getFolder(env, auth.user_id, folderId)) return jsonResponse({ error: 'FOLDER_NOT_FOUND' }, 404, requestId);

    const expiresAt = forever ? null : new Date(Date.now() + totalMinutes * 60_000).toISOString();
    const { licenseId, licenseKey } = await createLicenseRecord(env, { expiresAt });
    const recordId = crypto.randomUUID();
    try {
      await env.DB.prepare(`INSERT INTO frezen_key_records
        (id, owner_id, license_id, provider_id, service_id, folder_id, key_name, premium, forever)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`)
        .bind(recordId, auth.user_id, licenseId, provider.id, serviceId, folderId, keyName, premium ? 1 : 0, forever ? 1 : 0).run();
      await env.DB.prepare(`INSERT INTO frezen_key_limits (key_id, max_devices) VALUES (?1, ?2)`)
        .bind(recordId, maxDevices).run();
    } catch (error) {
      await env.DB.prepare('DELETE FROM frezen_key_limits WHERE key_id = ?1').bind(recordId).run().catch(() => {});
      await env.DB.prepare('DELETE FROM frezen_key_records WHERE id = ?1').bind(recordId).run().catch(() => {});
      await env.DB.prepare('DELETE FROM licenses WHERE id = ?1 AND user_id IS NULL').bind(licenseId).run().catch(() => {});
      throw error;
    }

    return jsonResponse({
      created: true,
      key: { id: recordId, license_id: licenseId, provider_id: provider.id, provider_name: provider.name, service_id: serviceId, key_name: keyName, premium, forever, expires_at: expiresAt, max_devices: maxDevices, status: 'active' },
      license_key: licenseKey,
    }, 201, requestId);
  } catch (error) {
    return jsonResponse({ error: String(error?.message || '').includes('LICENSE_SCHEMA') ? 'LICENSE_SCHEMA_INCOMPATIBLE' : 'DATABASE_ERROR', message: String(error?.message || 'Unable to create key') }, 503, requestId);
  }
}
