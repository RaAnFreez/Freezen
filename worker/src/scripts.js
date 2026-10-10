import { obfuscateLuaV11 } from './script-obfuscator-v11.js';
import { isFrezenObfuscated, OBFUSCATION_MARKER, OBFUSCATION_PROFILE } from './script-obfuscation-contract.js';
import { compileFrezenVmV4, FREZEN_VM_V4_PROFILE, isFrezenVmV4 } from './frezen-vm-v4.js';
import { compileFrezenVmV5, FREZEN_VM_V5_PROFILE, isFrezenVmV5 } from './frezen-vm-v5.js';
import { storeScriptPayloadPair, resolveScriptPayload, deleteStoredScriptPayloads, isR2ScriptPayload } from './script-payload-storage.js';

const MAX_LUA_BYTES = 3 * 1024 * 1024;
const VERSION_RE = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const DEFAULT_LOADER_URL = 'https://api.luarmor.net/files/v4/loaders/bf5d23724071469fc466114d4e10f88b.lua';
const bad = (json, requestId, error, status = 400, details) => json({ error, ...(details ? { details } : {}), request_id: requestId }, status, requestId);
const id = () => crypto.randomUUID();
const statusOk = (value) => String(value ?? '').trim().toUpperCase();
const normalizeProtectionMode = (value) => {
  const mode = String(value ?? 'source-v11').trim().toLowerCase();
  if (mode === 'vm-v5') return 'vm-v5';
  if (['vm-v1', 'vm-v2', 'vm-v3', 'vm-v4'].includes(mode)) return 'vm-v4';
  return 'source-v11';
};
const isVmProtectionMode = (mode) => mode === 'vm-v4' || mode === 'vm-v5';
const isRetiredVmArtifact = (value) => { const source = String(value ?? ''); return source.startsWith(OBFUSCATION_MARKER) && ((source.includes('FREZEN_VM_V3_BAD_EXPR') && source.includes('__frezen_v3')) || source.includes('FREZEN_VM_V2_CHUNK_MISSING') || source.includes('FREZEN_VM_CHUNK_MISSING')); };
const protectionProfile = (mode) => mode === 'vm-v5' ? FREZEN_VM_V5_PROFILE : (mode === 'vm-v4' ? FREZEN_VM_V4_PROFILE : OBFUSCATION_PROFILE);
const compileProtectedLua = (source, mode) => mode === 'vm-v5' ? compileFrezenVmV5(source) : (mode === 'vm-v4' ? compileFrezenVmV4(source) : obfuscateLuaV11(source));

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
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS script_files (id TEXT PRIMARY KEY, script_version_id TEXT NOT NULL, file_name TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'text/x-lua', size_bytes INTEGER NOT NULL, content TEXT NOT NULL, sha256 TEXT NOT NULL, source_size_bytes INTEGER, source_content TEXT, source_sha256 TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(script_version_id) REFERENCES script_versions(id) ON DELETE CASCADE)`),
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
  if (isFrezenObfuscated(content)) return { error: 'SOURCE_MUST_BE_PLAIN_LUA' };
  const protectionMode = normalizeProtectionMode(form.get('protection_mode'));
  if (new TextEncoder().encode(content).byteLength > MAX_LUA_BYTES) return { error: 'LUA_FILE_TOO_LARGE' };
  return { fileName, content, sizeBytes: file.size, version: cleanVersion(form.get('version')), releaseNotes: cleanText(form.get('release_notes'), 2000) ?? null, protectionMode };
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
    // A disabled script should block delivery, not owner-side version management.
    // Owners can upload/prepare a new version while the script remains disabled.
    const service = await env.DB.prepare('SELECT id FROM frezen_key_services WHERE id=?1 AND owner_id=?2 LIMIT 1').bind(script.service_id, auth?.user_id).first();
    if (!service) return bad(json, requestId, 'SERVICE_NOT_FOUND', 404);
    if (isVmProtectionMode(parsed.protectionMode) && String(env.FREZEN_VM_ENABLED ?? '').toLowerCase() !== 'true') return bad(json, requestId, parsed.protectionMode === 'vm-v5' ? 'VM_V5_DISABLED' : 'VM_V4_DISABLED', 409);
    const versionId = id();
    const fileId = id();
    let obfuscated;
    try {
      obfuscated = compileProtectedLua(parsed.content, parsed.protectionMode);
    } catch (error) {
      const reason = String(error?.message ?? error);
      const compileError = reason === 'OBFUSCATED_LUA_TOO_LARGE' ? reason : 'OBFUSCATION_FAILED';
      return bad(json, requestId, compileError, reason === 'OBFUSCATED_LUA_TOO_LARGE' ? 413 : 422, compileError === 'OBFUSCATION_FAILED' ? undefined : { protection_mode: parsed.protectionMode });
    }
    const sourceSha256 = await sha256Hex(parsed.content);
    const payloadSha256 = await sha256Hex(obfuscated.code);
    const sourceSizeBytes = new TextEncoder().encode(parsed.content).byteLength;
    const outputSizeBytes = new TextEncoder().encode(obfuscated.code).byteLength;
    const storedPair = await storeScriptPayloadPair(env, { scope: 'scripts', fileId, source: parsed.content, payload: obfuscated.code });
    await env.DB.prepare("INSERT INTO script_versions (id,script_id,version,file_reference,release_notes,status) VALUES (?1,?2,?3,?4,?5,'ARCHIVED')").bind(versionId, scriptId, parsed.version, fileId, parsed.releaseNotes).run();
    await env.DB.prepare("INSERT INTO script_files (id,script_version_id,file_name,content_type,size_bytes,content,sha256,source_size_bytes,source_content,source_sha256) VALUES (?1,?2,?3,'text/x-lua',?4,?5,?6,?7,?8,?9)").bind(fileId, versionId, parsed.fileName, outputSizeBytes, storedPair.content, payloadSha256, sourceSizeBytes, storedPair.sourceContent, sourceSha256).run();
    await audit(env, auth, 'SCRIPT_VERSION_UPLOADED', 'script_version', versionId, 'SUCCESS', requestId, { script_id: scriptId, version: parsed.version, source_bytes: sourceSizeBytes, output_bytes: outputSizeBytes, obfuscation: protectionProfile(parsed.protectionMode), protection_mode: parsed.protectionMode });
    return json({ version: { id: versionId, script_id: scriptId, version: parsed.version, file_name: parsed.fileName, size_bytes: outputSizeBytes, source_size_bytes: sourceSizeBytes, sha256: payloadSha256, source_sha256: sourceSha256, release_notes: parsed.releaseNotes, status: 'ARCHIVED', obfuscation: protectionProfile(parsed.protectionMode), protection_mode: parsed.protectionMode }, request_id: requestId }, 201, requestId);
  } catch (error) {
    if (String(error?.message ?? '').includes('UNIQUE')) return bad(json, requestId, 'VERSION_ALREADY_EXISTS', 409);
    if (String(error?.message ?? error) === 'SCRIPT_PAYLOADS_R2_BINDING_REQUIRED') return bad(json, requestId, 'SCRIPT_PAYLOADS_R2_BINDING_REQUIRED', 503);
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

export async function updateScriptVersionSource(request, env, requestId, json, auth, scriptId, versionId) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  let body;
  try { body = await request.json(); } catch { return bad(json, requestId, 'INVALID_JSON'); }
  const source = String(body?.source ?? '');
  const requestedProtectionMode = body?.protection_mode;
  let protectionMode = normalizeProtectionMode(requestedProtectionMode);
  if (!source.trim()) return bad(json, requestId, 'SOURCE_REQUIRED');
  if (isFrezenObfuscated(source)) return bad(json, requestId, 'SOURCE_MUST_BE_PLAIN_LUA');
  const sourceBytes = new TextEncoder().encode(source).byteLength;
  if (sourceBytes > MAX_LUA_BYTES) return bad(json, requestId, 'LUA_FILE_TOO_LARGE', 413);
  try {
    await ensureScriptSchema(env);
    if (isVmProtectionMode(protectionMode) && String(env.FREZEN_VM_ENABLED ?? '').toLowerCase() !== 'true') return bad(json, requestId, protectionMode === 'vm-v5' ? 'VM_V5_DISABLED' : 'VM_V4_DISABLED', 409);
    const access = await env.DB.prepare('SELECT s.id FROM scripts s JOIN frezen_key_services sv ON sv.id=s.service_id WHERE s.id=?1 AND sv.owner_id=?2 LIMIT 1').bind(scriptId, auth?.user_id).first();
    if (!access) return bad(json, requestId, 'SCRIPT_NOT_FOUND', 404);
    const row = await env.DB.prepare('SELECT sv.id,sv.version,sv.release_notes,sf.id AS file_id,sf.content AS existing_content,sf.source_content AS existing_source_content FROM script_versions sv JOIN script_files sf ON sf.script_version_id=sv.id WHERE sv.id=?1 AND sv.script_id=?2 LIMIT 1').bind(versionId, scriptId).first();
    if (!row) return bad(json, requestId, 'SCRIPT_VERSION_NOT_FOUND', 404);
    const existingContent = await resolveScriptPayload(env, row.existing_content);
    if (requestedProtectionMode === undefined) protectionMode = isFrezenVmV5(existingContent) ? 'vm-v5' : ((isFrezenVmV4(existingContent) || isRetiredVmArtifact(existingContent)) ? 'vm-v4' : 'source-v11');
    if (isVmProtectionMode(protectionMode) && String(env.FREZEN_VM_ENABLED ?? '').toLowerCase() !== 'true') return bad(json, requestId, protectionMode === 'vm-v5' ? 'VM_V5_DISABLED' : 'VM_V4_DISABLED', 409);
    let obfuscated;
    try { obfuscated = compileProtectedLua(source, protectionMode); } catch (error) {
      const reason = String(error?.message ?? error);
      return bad(json, requestId, reason === 'OBFUSCATED_LUA_TOO_LARGE' ? 'OBFUSCATED_LUA_TOO_LARGE' : 'OBFUSCATION_FAILED', reason === 'OBFUSCATED_LUA_TOO_LARGE' ? 413 : 422);
    }
    const sourceSha256 = await sha256Hex(source);
    const payloadSha256 = await sha256Hex(obfuscated.code);
    const outputBytes = new TextEncoder().encode(obfuscated.code).byteLength;
    const storedPair = await storeScriptPayloadPair(env, { scope: 'scripts', fileId: row.file_id, source, payload: obfuscated.code });
    await env.DB.prepare('UPDATE script_files SET content=?1,size_bytes=?2,sha256=?3,source_size_bytes=?4,source_content=?5,source_sha256=?6 WHERE id=?7 AND script_version_id=?8').bind(storedPair.content, outputBytes, payloadSha256, sourceBytes, storedPair.sourceContent, sourceSha256, row.file_id, versionId).run();
    await deleteStoredScriptPayloads(env, row.existing_content, row.existing_source_content);
    await env.DB.prepare('UPDATE scripts SET updated_at=CURRENT_TIMESTAMP WHERE id=?1').bind(scriptId).run();
    const releaseNotes = body?.release_notes === undefined ? row.release_notes : cleanText(body.release_notes, 2000);
    if (body?.release_notes !== undefined) await env.DB.prepare('UPDATE script_versions SET release_notes=?1 WHERE id=?2 AND script_id=?3').bind(releaseNotes, versionId, scriptId).run();
    await audit(env, auth, 'SCRIPT_VERSION_UPDATED', 'script_version', versionId, 'SUCCESS', requestId, { script_id: scriptId, version: row.version, source_bytes: sourceBytes, output_bytes: outputBytes, obfuscation: protectionProfile(protectionMode), protection_mode: protectionMode });
    return json({ status: 'updated', version: { id: versionId, version: row.version, size_bytes: outputBytes, source_size_bytes: sourceBytes, sha256: payloadSha256, source_sha256: sourceSha256, release_notes: releaseNotes, obfuscation: protectionProfile(protectionMode), protection_mode: protectionMode }, request_id: requestId });
  } catch (error) { if (String(error?.message ?? error) === 'SCRIPT_PAYLOADS_R2_BINDING_REQUIRED') return bad(json, requestId, 'SCRIPT_PAYLOADS_R2_BINDING_REQUIRED', 503); return bad(json, requestId, 'DATABASE_ERROR', 503); }
}

export async function deleteScriptVersion(request, env, requestId, json, auth, scriptId, versionId) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  try {
    await ensureScriptSchema(env);
    const access = await env.DB.prepare('SELECT s.id FROM scripts s JOIN frezen_key_services sv ON sv.id=s.service_id WHERE s.id=?1 AND sv.owner_id=?2 LIMIT 1').bind(scriptId, auth?.user_id).first();
    if (!access) return bad(json, requestId, 'SCRIPT_NOT_FOUND', 404);
    const version = await env.DB.prepare('SELECT id,version,status FROM script_versions WHERE id=?1 AND script_id=?2 LIMIT 1').bind(versionId, scriptId).first();
    if (!version) return bad(json, requestId, 'SCRIPT_VERSION_NOT_FOUND', 404);
    await env.DB.prepare('DELETE FROM script_versions WHERE id=?1 AND script_id=?2').bind(versionId, scriptId).run();
    let promoted = null;
    if (String(version.status).toUpperCase() === 'ACTIVE') {
      const next = await env.DB.prepare("SELECT id,version FROM script_versions WHERE script_id=?1 ORDER BY created_at DESC LIMIT 1").bind(scriptId).first();
      if (next) {
        await env.DB.batch([
          env.DB.prepare("UPDATE script_versions SET status='ARCHIVED' WHERE script_id=?1").bind(scriptId),
          env.DB.prepare("UPDATE script_versions SET status='ACTIVE' WHERE id=?1 AND script_id=?2").bind(next.id, scriptId),
        ]);
        promoted = { id: next.id, version: next.version };
      }
    }
    await env.DB.prepare('UPDATE scripts SET updated_at=CURRENT_TIMESTAMP WHERE id=?1').bind(scriptId).run();
    await audit(env, auth, 'SCRIPT_VERSION_DELETED', 'script_version', versionId, 'SUCCESS', requestId, { script_id: scriptId, version: version.version, promoted });
    return json({ status: 'deleted', deleted_version: version.version, promoted, request_id: requestId });
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

export async function getScript(request, env, requestId, json, scriptId) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  try {
    await ensureScriptSchema(env);
    const script = await env.DB.prepare(`SELECT s.id,s.service_id,s.name,s.description,s.loader_url,s.status,s.created_at,s.updated_at,sv.name AS service_name,sv.slug AS service_slug FROM scripts s LEFT JOIN frezen_key_services sv ON sv.id=s.service_id WHERE s.id=?1 LIMIT 1`).bind(scriptId).first();
    if (!script) return bad(json, requestId, 'SCRIPT_NOT_FOUND', 404);

    const url = new URL(request.url);
    const view = String(url.searchParams.get('view') ?? '').trim().toLowerCase();
    const requestedVersionId = String(url.searchParams.get('version_id') ?? '').trim();

    if (view === 'editor') {
      if (!requestedVersionId || requestedVersionId.length > 128) return bad(json, requestId, 'VERSION_ID_REQUIRED');
      const row = await env.DB.prepare(`SELECT sv.id,sv.version,sv.status,sv.release_notes,sv.created_at,sf.file_name,sf.content,sf.content_type,sf.size_bytes,sf.sha256,sf.source_content,sf.source_size_bytes,sf.source_sha256
        FROM script_versions sv JOIN script_files sf ON sf.script_version_id=sv.id
        WHERE sv.id=?1 AND sv.script_id=?2 LIMIT 1`).bind(requestedVersionId, scriptId).first();
      if (!row) return bad(json, requestId, 'SCRIPT_VERSION_NOT_FOUND', 404);
      const payloadContent = await resolveScriptPayload(env, row.content);
      const storedSource = row.source_content ? await resolveScriptPayload(env, row.source_content) : '';
      const verified = isFrezenObfuscated(payloadContent);
      const sourceWasObfuscated = Boolean(storedSource && isFrezenObfuscated(storedSource));
      const source = sourceWasObfuscated ? '' : (storedSource || (!verified ? payloadContent : ''));
      const sourceUnavailableReason = sourceWasObfuscated
        ? 'SOURCE_CONTENT_IS_OBFUSCATED'
        : (!source && verified ? 'LEGACY_SOURCE_UNAVAILABLE' : null);
      return json({
        view: 'editor',
        script_id: scriptId,
        version: { id: row.id, version: row.version, status: row.status, release_notes: row.release_notes, created_at: row.created_at },
        source: { available: Boolean(source), content: source, size_bytes: source ? Number(row.source_size_bytes ?? new TextEncoder().encode(source).byteLength) : 0, sha256: row.source_sha256 ?? (source ? await sha256Hex(source) : null), ...(sourceUnavailableReason ? { reason: sourceUnavailableReason } : {}) },
        payload: {
          file_name: row.file_name,
          content_type: row.content_type,
          size_bytes: row.size_bytes,
          sha256: row.sha256,
          obfuscation_verified: verified,
          obfuscation_marker: verified ? OBFUSCATION_MARKER : 'marker-missing',
          profile: verified ? (isFrezenVmV5(payloadContent) ? FREZEN_VM_V5_PROFILE : (isFrezenVmV4(payloadContent) ? FREZEN_VM_V4_PROFILE : (isRetiredVmArtifact(payloadContent) ? { version: 'legacy', mode: 'Retired Frezen VM artifact', strength: 'LEGACY', protectionLevel: 0 } : OBFUSCATION_PROFILE))) : { version: 'legacy', status: 'unverified' },
          content: payloadContent,
        },
        request_id: requestId,
      });
    }

    if (view === 'obfuscated') {
      if (!requestedVersionId || requestedVersionId.length > 128) return bad(json, requestId, 'VERSION_ID_REQUIRED');
      const row = await env.DB.prepare(`SELECT sv.id,sv.version,sv.status,sv.release_notes,sv.created_at,sf.file_name,sf.content,sf.content_type,sf.size_bytes,sf.sha256
        FROM script_versions sv JOIN script_files sf ON sf.script_version_id=sv.id
        WHERE sv.id=?1 AND sv.script_id=?2 LIMIT 1`).bind(requestedVersionId, scriptId).first();
      if (!row) return bad(json, requestId, 'SCRIPT_VERSION_NOT_FOUND', 404);
      const payloadContent = await resolveScriptPayload(env, row.content);
      const verified = isFrezenObfuscated(payloadContent);
      return json({
        view: 'obfuscated',
        script_id: scriptId,
        version: { id: row.id, version: row.version, status: row.status, release_notes: row.release_notes, created_at: row.created_at },
        payload: {
          file_name: row.file_name,
          content_type: row.content_type,
          size_bytes: row.size_bytes,
          sha256: row.sha256,
          obfuscation_verified: verified,
          obfuscation_marker: verified ? OBFUSCATION_MARKER : 'marker-missing',
          profile: verified ? (isFrezenVmV5(payloadContent) ? FREZEN_VM_V5_PROFILE : (isFrezenVmV4(payloadContent) ? FREZEN_VM_V4_PROFILE : (isRetiredVmArtifact(payloadContent) ? { version: 'legacy', mode: 'Retired Frezen VM artifact', strength: 'LEGACY', protectionLevel: 0 } : OBFUSCATION_PROFILE))) : { version: 'legacy', status: 'unverified' },
          content: payloadContent,
        },
        request_id: requestId,
      });
    }

    const versions = await env.DB.prepare(`SELECT sv.id,sv.version,sv.file_reference,sv.release_notes,sv.status,sv.created_at,sf.file_name,sf.size_bytes,sf.sha256,sf.content_type,sf.source_size_bytes
      FROM script_versions sv LEFT JOIN script_files sf ON sf.script_version_id=sv.id
      WHERE sv.script_id=?1 ORDER BY sv.created_at DESC`).bind(scriptId).all();
    const mappedVersions = (versions.results ?? []).map((row) => ({
      id: row.id,
      version: row.version,
      file_reference: row.file_reference,
      file_name: row.file_name,
      release_notes: row.release_notes,
      status: row.status,
      created_at: row.created_at,
      size_bytes: row.size_bytes,
      sha256: row.sha256,
      content_type: row.content_type,
      obfuscation_verified: isFrezenObfuscated(row.content) || isR2ScriptPayload(row.content),
      source_size_bytes: row.source_size_bytes,
      obfuscated_view_url: `/api/v1/scripts/${encodeURIComponent(scriptId)}?view=obfuscated&version_id=${encodeURIComponent(row.id)}`,
    }));
    return json({ script, versions: mappedVersions, request_id: requestId });
  } catch { return bad(json, requestId, 'DATABASE_ERROR', 503); }
}
