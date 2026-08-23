const MAX_LUA_BYTES = 3 * 1024 * 1024;
const VERSION_RE = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const DEFAULT_LOADER_URL = 'https://api.luarmor.net/files/v4/loaders/bf5d23724071469fc466114d4e10f88b.lua';
const bad = (json, requestId, error, status = 400, details) => json({ error, ...(details ? { details } : {}), request_id: requestId }, status, requestId);
const id = () => crypto.randomUUID();
const statusOk = (value) => String(value ?? '').trim().toUpperCase();

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cleanName(name) {
  const value = String(name ?? '').trim();
  if (!value || value.length > 120 || /[\\/\0]/.test(value) || !value.toLowerCase().endsWith('.lua')) return null;
  return value;
}
function cleanVersion(value) {
  const version = String(value ?? '').trim();
  return VERSION_RE.test(version) ? (version.startsWith('v') ? version : `v${version}`) : null;
}
function cleanText(value, max) {
  const text = String(value ?? '').trim();
  return text.length <= max ? text : null;
}
function cleanUrl(value) {
  const url = String(value ?? '').trim();
  if (!url) return DEFAULT_LOADER_URL;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch { return null; }
}

async function audit(env, auth, action, resourceType, resourceId, status, requestId, metadata = {}) {
  if (!env.DB) return;
  try { await env.DB.prepare('INSERT INTO audit_logs (id,user_id,action,resource_type,resource_id,status,request_id,metadata_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)').bind(id(), auth?.user_id ?? null, action, resourceType, resourceId ?? null, status, requestId, JSON.stringify(metadata)).run(); } catch {}
}

export async function ensureScriptSchema(env) {
  if (!env?.DB) throw new Error('DATABASE_UNAVAILABLE');
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS scripts (id TEXT PRIMARY KEY, service_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, loader_url TEXT NOT NULL DEFAULT '${DEFAULT_LOADER_URL}', status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED')), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(service_id) REFERENCES frezen_key_services(id) ON DELETE RESTRICT)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_scripts_service ON scripts(service_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_scripts_status ON scripts(status)'),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_scripts_service_name ON scripts(service_id, name)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS script_versions (id TEXT PRIMARY KEY, script_id TEXT NOT NULL, version TEXT NOT NULL, file_reference TEXT NOT NULL, release_notes TEXT, status TEXT NOT NULL DEFAULT 'ARCHIVED' CHECK(status IN ('ACTIVE','ARCHIVED','DISABLED')), created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_script_versions_script ON script_versions(script_id, created_at DESC)'),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_script_versions_unique ON script_versions(script_id, version)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS script_files (id TEXT PRIMARY KEY, script_version_id TEXT NOT NULL, file_name TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'text/x-lua', size_bytes INTEGER NOT NULL, content TEXT NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(script_version_id) REFERENCES script_versions(id) ON DELETE CASCADE)`),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_script_files_version ON script_files(script_version_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_script_files_sha256 ON script_files(sha256)'),
  ]);
}

export async function listScripts(request, env, requestId, json) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const status = (url.searchParams.get('status') ?? '').trim().toUpperCase();
  const serviceId = (url.searchParams.get('service_id') ?? '').trim();
  const page = Number(url.searchParams.get('page') ?? '1');
  const pageSize = Number(url.searchParams.get('page_size') ?? '20');
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return bad(json, requestId, 'INVALID_PAGINATION');
  if (status && !['ACTIVE', 'DISABLED'].includes(status)) return bad(json, requestId, 'INVALID_SCRIPT_STATUS');
  if (q.length > 100 || serviceId.length > 128) return bad(json, requestId, 'INVALID_SCRIPT_FILTER');
  try {
    await ensureScriptSchema(env);
    const where = [];
    const bindings = [];
    if (status) { where.push('s.status = ?'); bindings.push(status); }
    if (serviceId) { where.push('s.service_id = ?'); bindings.push(serviceId); }
    if (q) { where.push('(s.id LIKE ? OR s.name LIKE ? OR s.description LIKE ? OR sv.name LIKE ?)'); const pattern = `%${q}%`; bindings.push(pattern, pattern, pattern, pattern); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS total FROM scripts s LEFT JOIN frezen_key_services sv ON sv.id=s.service_id ${clause}`).bind(...bindings).first();
    const total = Number(totalRow?.total ?? 0);
    const offset = (page - 1) * pageSize;
    const rows = await env.DB.prepare(`SELECT s.id,s.service_id,s.name,s.description,s.loader_url,s.status,s.created_at,s.updated_at,sv.name AS service_name,sv.slug AS service_slug,(SELECT COUNT(*) FROM script_versions v WHERE v.script_id=s.id) AS version_count,(SELECT v.version FROM script_versions v WHERE v.script_id=s.id AND v.status='ACTIVE' ORDER BY v.created_at DESC LIMIT 1) AS active_version FROM scripts s LEFT JOIN frezen_key_services sv ON sv.id=s.service_id ${clause} ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`).bind(...bindings, pageSize, offset).all();
    return json({ scripts: rows.results ?? [], pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) }, request_id: requestId });
  } catch { return bad(json, requestId, 'DATABASE_ERROR', 503); }
}

export async function createScript(request, env, requestId, json, auth) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  let body;
  try { body = await request.json(); } catch { return bad(json, requestId, 'INVALID_JSON'); }
  const serviceId = String(body?.service_id ?? '').trim();
  const name = cleanText(body?.name, 120);
  const description = cleanText(body?.description, 1000) ?? null;
  const loaderUrl = cleanUrl(body?.loader_url);
  if (!serviceId || !name) return bad(json, requestId, 'SERVICE_ID_AND_NAME_REQUIRED');
  if (!loaderUrl) return bad(json, requestId, 'INVALID_LOADER_URL');
  try {
    await ensureScriptSchema(env);
    const service = await env.DB.prepare('SELECT id,name,slug,active FROM frezen_key_services WHERE id=?1 AND owner_id=?2 LIMIT 1').bind(serviceId, auth?.user_id).first();
    if (!service) return bad(json, requestId, 'SERVICE_NOT_FOUND', 404);
    if (!service.active) return bad(json, requestId, 'SERVICE_DISABLED', 409);
    const scriptId = id();
    await env.DB.prepare("INSERT INTO scripts (id,service_id,name,description,loader_url,status) VALUES (?1,?2,?3,?4,?5,'ACTIVE')").bind(scriptId, serviceId, name, description, loaderUrl).run();
    await audit(env, auth, 'SCRIPT_CREATED', 'script', scriptId, 'SUCCESS', requestId, { service_id: serviceId });
    return json({ script: { id: scriptId, service_id: serviceId, service_name: service.name, service_slug: service.slug, name, description, loader_url: loaderUrl, status: 'ACTIVE' }, request_id: requestId }, 201, requestId);
  } catch (error) {
    if (String(error?.message ?? '').includes('UNIQUE')) return bad(json, requestId, 'SCRIPT_ALREADY_EXISTS', 409);
    return bad(json, requestId, 'DATABASE_ERROR', 503);
  }
}

async function parseUpload(request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) return { error: 'MULTIPART_FORM_DATA_REQUIRED' };
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return { error: 'LUA_FILE_REQUIRED' };
  const fileName = cleanName(file.name);
  if (!fileName) return { error: 'INVALID_LUA_FILENAME' };
  if (file.size <= 0 || file.size > MAX_LUA_BYTES) return { error: 'LUA_FILE_TOO_LARGE_OR_EMPTY' };
  const content = await file.text();
  if (new TextEncoder().encode(content).byteLength > MAX_LUA_BYTES) return { error: 'LUA_FILE_TOO_LARGE' };
  return { fileName, content, sizeBytes: file.size, version: cleanVersion(form.get('version')), releaseNotes: cleanText(form.get('release_notes'), 2000) ?? null };
}

export async function uploadScriptVersion(request, env, requestId, json, auth, scriptId) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  const parsed = await parseUpload(request);
  if (parsed.error) return bad(json, requestId, parsed.error);
  if (!parsed.version) return bad(json, requestId, 'INVALID_VERSION');
  try {
    await ensureScriptSchema(env);
    const script = await env.DB.prepare('SELECT id,service_id,status FROM scripts WHERE id=?1 LIMIT 1').bind(scriptId).first();
    if (!script) return bad(json, requestId, 'SCRIPT_NOT_FOUND', 404);
    if (statusOk(script.status) !== 'ACTIVE') return bad(json, requestId, 'SCRIPT_DISABLED', 409);
    const service = await env.DB.prepare('SELECT id FROM frezen_key_services WHERE id=?1 AND owner_id=?2 LIMIT 1').bind(script.service_id, auth?.user_id).first();
    if (!service) return bad(json, requestId, 'SERVICE_NOT_FOUND', 404);
    const versionId = id();
    const fileId = id();
    const sha256 = await sha256Hex(parsed.content);
    await env.DB.prepare("INSERT INTO script_versions (id,script_id,version,file_reference,release_notes,status) VALUES (?1,?2,?3,?4,?5,'ARCHIVED')").bind(versionId, scriptId, parsed.version, fileId, parsed.releaseNotes).run();
    await env.DB.prepare("INSERT INTO script_files (id,script_version_id,file_name,content_type,size_bytes,content,sha256) VALUES (?1,?2,?3,'text/x-lua',?4,?5,?6)").bind(fileId, versionId, parsed.fileName, parsed.sizeBytes, parsed.content, sha256).run();
    await audit(env, auth, 'SCRIPT_VERSION_UPLOADED', 'script_version', versionId, 'SUCCESS', requestId, { script_id: scriptId, version: parsed.version });
    return json({ version: { id: versionId, script_id: scriptId, version: parsed.version, file_name: parsed.fileName, size_bytes: parsed.sizeBytes, sha256, release_notes: parsed.releaseNotes, status: 'ARCHIVED' }, request_id: requestId }, 201, requestId);
  } catch (error) {
    if (String(error?.message ?? '').includes('UNIQUE')) return bad(json, requestId, 'VERSION_ALREADY_EXISTS', 409);
    return bad(json, requestId, 'DATABASE_ERROR', 503);
  }
}

export async function setScriptVersionActive(request, env, requestId, json, auth, scriptId, versionId) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  try {
    await ensureScriptSchema(env);
    const version = await env.DB.prepare('SELECT id,script_id,version,status FROM script_versions WHERE id=?1 AND script_id=?2 LIMIT 1').bind(versionId, scriptId).first();
    if (!version) return bad(json, requestId, 'SCRIPT_VERSION_NOT_FOUND', 404);
    const access = await env.DB.prepare('SELECT s.id FROM scripts s JOIN frezen_key_services sv ON sv.id=s.service_id WHERE s.id=?1 AND sv.owner_id=?2').bind(scriptId, auth?.user_id).first();
    if (!access) return bad(json, requestId, 'SCRIPT_NOT_FOUND', 404);
    if (statusOk(version.status) === 'DISABLED') return bad(json, requestId, 'SCRIPT_VERSION_DISABLED', 409);
    await env.DB.batch([env.DB.prepare("UPDATE script_versions SET status='ARCHIVED' WHERE script_id=?1 AND status='ACTIVE'").bind(scriptId),env.DB.prepare("UPDATE script_versions SET status='ACTIVE' WHERE id=?1 AND script_id=?2").bind(versionId, scriptId),env.DB.prepare("UPDATE scripts SET updated_at=CURRENT_TIMESTAMP WHERE id=?1").bind(scriptId)]);
    await audit(env, auth, 'SCRIPT_VERSION_ACTIVATED', 'script_version', versionId, 'SUCCESS', requestId, { script_id: scriptId, version: version.version });
    return json({ status: 'active', version: { id: version.id, version: version.version }, request_id: requestId });
  } catch { return bad(json, requestId, 'DATABASE_ERROR', 503); }
}

export async function updateScript(request, env, requestId, json, auth, scriptId) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  let body;
  try { body = await request.json(); } catch { return bad(json, requestId, 'INVALID_JSON'); }
  if (!['ACTIVE', 'DISABLED'].includes(body?.status)) return bad(json, requestId, 'INVALID_SCRIPT_STATUS');
  try {
    await ensureScriptSchema(env);
    const exists = await env.DB.prepare('SELECT s.id FROM scripts s JOIN frezen_key_services sv ON sv.id=s.service_id WHERE s.id=?1 AND sv.owner_id=?2 LIMIT 1').bind(scriptId, auth?.user_id).first();
    if (!exists) return bad(json, requestId, 'SCRIPT_NOT_FOUND', 404);
    const result = await env.DB.prepare('UPDATE scripts SET status=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2').bind(body.status, scriptId).run();
    if (!result?.meta?.changes) return bad(json, requestId, 'SCRIPT_NOT_FOUND', 404);
    await audit(env, auth, 'SCRIPT_STATUS_CHANGED', 'script', scriptId, 'SUCCESS', requestId, { status: body.status });
    return json({ status: body.status, request_id: requestId });
  } catch { return bad(json, requestId, 'DATABASE_ERROR', 503); }
}

export async function deleteScript(request, env, requestId, json, auth, scriptId) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  try {
    await ensureScriptSchema(env);
    const exists = await env.DB.prepare('SELECT s.id FROM scripts s JOIN frezen_key_services sv ON sv.id=s.service_id WHERE s.id=?1 AND sv.owner_id=?2 LIMIT 1').bind(scriptId, auth?.user_id).first();
    if (!exists) return bad(json, requestId, 'SCRIPT_NOT_FOUND', 404);
    const result = await env.DB.prepare('DELETE FROM scripts WHERE id=?1').bind(scriptId).run();
    if (!result?.meta?.changes) return bad(json, requestId, 'SCRIPT_NOT_FOUND', 404);
    await audit(env, auth, 'SCRIPT_DELETED', 'script', scriptId, 'SUCCESS', requestId);
    return json({ status: 'deleted', request_id: requestId });
  } catch { return bad(json, requestId, 'DATABASE_ERROR', 503); }
}
