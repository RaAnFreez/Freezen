import { obfuscateLuaV11, ADVANCED_V11_PROFILE } from './script-obfuscator-v11.js';
import { MAX_LUA_BYTES, OBFUSCATION_MARKER, isFrezenObfuscated } from './script-obfuscation-contract.js';

const VERSION_RE = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const bad = (json, requestId, error, status = 400, details) => json({ error, ...(details ? { details } : {}), request_id: requestId }, status, requestId);
const id = () => crypto.randomUUID();
const text = (v, max) => { const s = String(v ?? '').trim(); return s && s.length <= max ? s : null; };
const version = (v) => { const s = String(v ?? '').trim(); return VERSION_RE.test(s) ? (s.startsWith('v') ? s : `v${s}`) : null; };

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function ensureSchema(env) {
  if (!env?.DB) throw new Error('DATABASE_UNAVAILABLE');
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS delivery_scripts (id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT,status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED')),created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(name))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS delivery_script_versions (id TEXT PRIMARY KEY,delivery_script_id TEXT NOT NULL,version TEXT NOT NULL,file_reference TEXT NOT NULL,release_notes TEXT,status TEXT NOT NULL DEFAULT 'ARCHIVED' CHECK(status IN ('ACTIVE','ARCHIVED','DISABLED')),created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(delivery_script_id,version),FOREIGN KEY(delivery_script_id) REFERENCES delivery_scripts(id) ON DELETE CASCADE)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS delivery_script_files (id TEXT PRIMARY KEY,delivery_script_version_id TEXT NOT NULL,file_name TEXT NOT NULL,content_type TEXT NOT NULL DEFAULT 'text/x-lua',size_bytes INTEGER NOT NULL,content TEXT NOT NULL,sha256 TEXT NOT NULL,obfuscation_version TEXT NOT NULL DEFAULT '1.1',obfuscation_strength TEXT NOT NULL DEFAULT 'VERY_HIGH',obfuscation_protection_level INTEGER NOT NULL DEFAULT 100,created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(delivery_script_version_id),FOREIGN KEY(delivery_script_version_id) REFERENCES delivery_script_versions(id) ON DELETE CASCADE)`),
  ]);
}

async function audit(env, auth, action, resourceId, requestId, metadata = {}) {
  if (!env.DB) return;
  try { await env.DB.prepare('INSERT INTO audit_logs (id,user_id,action,resource_type,resource_id,status,request_id,metadata_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)').bind(id(), auth?.user_id ?? null, action, 'delivery_script', resourceId ?? null, 'SUCCESS', requestId, JSON.stringify(metadata)).run(); } catch {}
}

async function obfuscateUpload(request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return { error: 'LUA_FILE_REQUIRED' };
  if (file.size <= 0 || file.size > MAX_LUA_BYTES) return { error: 'LUA_FILE_TOO_LARGE_OR_EMPTY' };
  const fileName = text(file.name, 120);
  if (!fileName || !fileName.toLowerCase().endsWith('.lua') || /[\\/\0]/.test(fileName)) return { error: 'INVALID_LUA_FILENAME' };
  const v = version(form.get('version'));
  if (!v) return { error: 'INVALID_VERSION' };
  const releaseNotes = text(form.get('release_notes'), 2000);
  const source = await file.text();
  if (new TextEncoder().encode(source).byteLength > MAX_LUA_BYTES) return { error: 'LUA_FILE_TOO_LARGE' };
  let result;
  try {
    result = obfuscateLuaV11(source);
    result.code = String(result.code ?? '').replace(/t\[i\]~\(\(\(k\+i-1\)%255\)\+1\)/g, '(function(a,b)local bx=bit32 and bit32.bxor;if type(bx)=="function" then return bx(a,b) end;local r,p=0,1;while a>0 or b>0 do local x=a%2;local y=b%2;if x~=y then r=r+p end;a=(a-x)/2;b=(b-y)/2;p=p*2 end;return r end)(t[i],(((k+i-1)%255)+1))');
    result.code = result.code.replace(/([A-Za-z0-9_)\]])--([A-Za-z_(])/g, '$1- -$2');
    result.code = `${OBFUSCATION_MARKER}\n${result.code}`;
  } catch (error) { return { error: 'OBFUSCATION_FAILED', details: String(error?.message || 'unknown') }; }
  if (!isFrezenObfuscated(result.code)) return { error: 'OBFUSCATION_VERIFICATION_FAILED' };
  const bytes = new TextEncoder().encode(result.code).byteLength;
  if (bytes <= 0 || bytes > MAX_LUA_BYTES) return { error: 'OBFUSCATED_LUA_TOO_LARGE' };
  return { fileName, version: v, releaseNotes, code: result.code, sourceBytes: new TextEncoder().encode(source).byteLength, outputBytes: bytes, sha256: await sha256Hex(result.code) };
}

export async function listDeliveryScripts(request, env, requestId, json) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  try {
    await ensureSchema(env);
    const rows = await env.DB.prepare(`SELECT s.id,s.name,s.description,s.status,s.created_at,s.updated_at,(SELECT COUNT(*) FROM delivery_script_versions v WHERE v.delivery_script_id=s.id) AS version_count,(SELECT v.version FROM delivery_script_versions v WHERE v.delivery_script_id=s.id AND v.status='ACTIVE' ORDER BY v.created_at DESC LIMIT 1) AS active_version FROM delivery_scripts s ORDER BY s.updated_at DESC`).all();
    return json({ scripts: rows.results ?? [], request_id: requestId });
  } catch { return bad(json, requestId, 'DATABASE_ERROR', 503); }
}

export async function createDeliveryScript(request, env, requestId, json, auth) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  let body; try { body = await request.json(); } catch { return bad(json, requestId, 'INVALID_JSON'); }
  const name = text(body?.name, 120); const description = text(body?.description, 1000);
  if (!name) return bad(json, requestId, 'NAME_REQUIRED');
  try {
    await ensureSchema(env); const deliveryId = id();
    await env.DB.prepare(`INSERT INTO delivery_scripts (id,name,description,status) VALUES (?1,?2,?3,'ACTIVE')`).bind(deliveryId,name,description).run();
    await audit(env, auth, 'DELIVERY_SCRIPT_CREATED', deliveryId, requestId, { name });
    return json({ script: { id: deliveryId, name, description, status: 'ACTIVE', version_count: 0, active_version: null }, request_id: requestId }, 201, requestId);
  } catch (error) { if (String(error?.message ?? '').includes('UNIQUE')) return bad(json, requestId, 'DELIVERY_SCRIPT_ALREADY_EXISTS', 409); return bad(json, requestId, 'DATABASE_ERROR', 503); }
}

export async function getDeliveryScript(request, env, requestId, json, deliveryId) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  try {
    await ensureSchema(env);
    const script = await env.DB.prepare(`SELECT id,name,description,status,created_at,updated_at FROM delivery_scripts WHERE id=?1 LIMIT 1`).bind(deliveryId).first();
    if (!script) return bad(json, requestId, 'DELIVERY_SCRIPT_NOT_FOUND', 404);
    const versions = await env.DB.prepare(`SELECT id,version,release_notes,status,created_at FROM delivery_script_versions WHERE delivery_script_id=?1 ORDER BY created_at DESC`).bind(deliveryId).all();
    return json({ script, versions: versions.results ?? [], request_id: requestId });
  } catch { return bad(json, requestId, 'DATABASE_ERROR', 503); }
}

export async function uploadDeliveryVersion(request, env, requestId, json, auth, deliveryId) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  const parsed = await obfuscateUpload(request);
  if (parsed.error) return bad(json, requestId, parsed.error, parsed.error === 'OBFUSCATED_LUA_TOO_LARGE' ? 413 : 422, parsed.details ? { message: parsed.details } : undefined);
  try {
    await ensureSchema(env);
    const script = await env.DB.prepare('SELECT id,status FROM delivery_scripts WHERE id=?1 LIMIT 1').bind(deliveryId).first();
    if (!script) return bad(json, requestId, 'DELIVERY_SCRIPT_NOT_FOUND', 404);
    if (script.status !== 'ACTIVE') return bad(json, requestId, 'DELIVERY_SCRIPT_DISABLED', 409);
    const versionId = id(), fileId = id();
    await env.DB.prepare(`INSERT INTO delivery_script_versions (id,delivery_script_id,version,file_reference,release_notes,status) VALUES (?1,?2,?3,?4,?5,'ARCHIVED')`).bind(versionId,deliveryId,parsed.version,fileId,parsed.releaseNotes).run();
    await env.DB.prepare(`INSERT INTO delivery_script_files (id,delivery_script_version_id,file_name,size_bytes,content,sha256,obfuscation_version,obfuscation_strength,obfuscation_protection_level) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`).bind(fileId,versionId,parsed.fileName,parsed.outputBytes,parsed.code,parsed.sha256,ADVANCED_V11_PROFILE.version,ADVANCED_V11_PROFILE.strength,ADVANCED_V11_PROFILE.protectionLevel).run();
    await audit(env, auth, 'DELIVERY_VERSION_UPLOADED', deliveryId, requestId, { version: parsed.version, source_bytes: parsed.sourceBytes, output_bytes: parsed.outputBytes, sha256: parsed.sha256 });
    return json({ version: { id: versionId, version: parsed.version, status: 'ARCHIVED', size_bytes: parsed.outputBytes, sha256: parsed.sha256, obfuscation: { version: ADVANCED_V11_PROFILE.version, strength: ADVANCED_V11_PROFILE.strength, protection_level: ADVANCED_V11_PROFILE.protectionLevel } }, request_id: requestId }, 201, requestId);
  } catch (error) { if (String(error?.message ?? '').includes('UNIQUE')) return bad(json, requestId, 'VERSION_ALREADY_EXISTS', 409); return bad(json, requestId, 'DATABASE_ERROR', 503); }
}

export async function activateDeliveryVersion(request, env, requestId, json, auth, deliveryId, versionId) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  try {
    await ensureSchema(env);
    const row = await env.DB.prepare('SELECT id,version,status FROM delivery_script_versions WHERE id=?1 AND delivery_script_id=?2 LIMIT 1').bind(versionId,deliveryId).first();
    if (!row) return bad(json, requestId, 'DELIVERY_VERSION_NOT_FOUND', 404);
    await env.DB.batch([
      env.DB.prepare("UPDATE delivery_script_versions SET status='ARCHIVED' WHERE delivery_script_id=?1 AND status='ACTIVE'").bind(deliveryId),
      env.DB.prepare("UPDATE delivery_script_versions SET status='ACTIVE' WHERE id=?1 AND delivery_script_id=?2").bind(versionId,deliveryId),
      env.DB.prepare("UPDATE delivery_scripts SET updated_at=CURRENT_TIMESTAMP WHERE id=?1").bind(deliveryId),
    ]);
    await audit(env, auth, 'DELIVERY_VERSION_ACTIVATED', deliveryId, requestId, { version_id: versionId, version: row.version });
    return json({ status: 'active', version: row.version, request_id: requestId });
  } catch { return bad(json, requestId, 'DATABASE_ERROR', 503); }
}

export async function updateDeliveryScript(request, env, requestId, json, auth, deliveryId) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  let body; try { body = await request.json(); } catch { return bad(json, requestId, 'INVALID_JSON'); }
  if (!['ACTIVE','DISABLED'].includes(body?.status)) return bad(json, requestId, 'INVALID_STATUS');
  try { await ensureSchema(env); const result = await env.DB.prepare('UPDATE delivery_scripts SET status=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2').bind(body.status,deliveryId).run(); if (!result?.meta?.changes) return bad(json, requestId, 'DELIVERY_SCRIPT_NOT_FOUND', 404); await audit(env, auth, 'DELIVERY_STATUS_CHANGED', deliveryId, requestId, { status: body.status }); return json({ status: body.status, request_id: requestId }); } catch { return bad(json, requestId, 'DATABASE_ERROR', 503); }
}

export async function deleteDeliveryScript(request, env, requestId, json, auth, deliveryId) {
  if (!env.DB) return bad(json, requestId, 'DATABASE_UNAVAILABLE', 503);
  try { await ensureSchema(env); const result = await env.DB.prepare('DELETE FROM delivery_scripts WHERE id=?1').bind(deliveryId).run(); if (!result?.meta?.changes) return bad(json, requestId, 'DELIVERY_SCRIPT_NOT_FOUND', 404); await audit(env, auth, 'DELIVERY_SCRIPT_DELETED', deliveryId, requestId); return json({ status: 'deleted', request_id: requestId }); } catch { return bad(json, requestId, 'DATABASE_ERROR', 503); }
}

export async function deliverPublicScript(request, env, requestId, deliveryId) {
  if (!env.DB) return new Response('DATABASE_UNAVAILABLE', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-request-id': requestId } });
  try {
    await ensureSchema(env);
    const row = await env.DB.prepare(`SELECT f.content,f.sha256,s.status AS script_status,v.status AS version_status FROM delivery_script_files f JOIN delivery_script_versions v ON v.id=f.delivery_script_version_id JOIN delivery_scripts s ON s.id=v.delivery_script_id WHERE s.id=?1 AND v.status='ACTIVE' LIMIT 1`).bind(deliveryId).first();
    if (!row || row.script_status !== 'ACTIVE' || row.version_status !== 'ACTIVE') return new Response('SCRIPT_DISABLED', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-request-id': requestId } });
    return new Response(row.content, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-disposition': 'inline', 'etag': `"${row.sha256}"`, 'x-frezen-delivery': 'keyless-obfuscated-v1.1', 'x-request-id': requestId } });
  } catch { return new Response('DATABASE_ERROR', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-request-id': requestId } }); }
}
