import baseEntry from './entry-ui-getkey-script-obfuscated.js';
import { requirePrivateAccess } from './security/private-access.js';
import { decryptKeySecret } from './key-secret.js';
import { bindRuntimeHwid } from './security/runtime-hwid.js';
import { deliverScriptFileByKey } from './script-loader.js';
import { buildEmbeddedLoaderSource, createEmbeddedDeliveryToken, verifyEmbeddedDeliveryToken } from './embedded-loader.js';
import { listDeliveryScripts, createDeliveryScript, getDeliveryScript, uploadDeliveryVersion, activateDeliveryVersion, updateDeliveryScript, deleteDeliveryScript, deliverPublicScript } from './script-delivery.js';

const noStore = { 'cache-control': 'no-store, no-cache, must-revalidate', pragma: 'no-cache' };
const json = (data, status = 200, requestId = '') => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...noStore, 'x-request-id': requestId },
});
const text = (body, status = 200, requestId = '') => new Response(String(body), {
  status,
  headers: { 'content-type': 'text/plain; charset=utf-8', ...noStore, 'x-frezen-request-id': requestId },
});
const isEnabled = (env, name) => String(env?.[name] ?? 'true').trim().toLowerCase() !== 'false';

function scriptMatch(pathname) { return pathname.match(/^\/api\/v1\/scripts\/([^/]+)\/embedded-loader$/); }
async function findScriptForOwner(env, scriptId, ownerId) {
  return env.DB.prepare(`SELECT s.id, s.service_id, s.status FROM scripts s JOIN frezen_key_services sv ON sv.id = s.service_id WHERE s.id = ?1 AND sv.owner_id = ?2 LIMIT 1`).bind(scriptId, ownerId).first();
}
async function chooseKeyRecord(env, scriptId, ownerId, keyRecordId = '') {
  if (keyRecordId) return env.DB.prepare(`SELECT k.id, k.license_id, l.status AS license_status, l.expires_at FROM frezen_key_records k JOIN licenses l ON l.id = k.license_id JOIN scripts s ON s.service_id = k.service_id JOIN frezen_key_services sv ON sv.id = s.service_id WHERE k.id = ?1 AND s.id = ?2 AND sv.owner_id = ?3 LIMIT 1`).bind(keyRecordId, scriptId, ownerId).first();
  return env.DB.prepare(`SELECT k.id, k.license_id, l.status AS license_status, l.expires_at FROM frezen_key_records k JOIN licenses l ON l.id = k.license_id JOIN scripts s ON s.service_id = k.service_id JOIN frezen_key_services sv ON sv.id = s.service_id WHERE s.id = ?1 AND sv.owner_id = ?2 AND LOWER(COALESCE(l.status, '')) = 'active' AND (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP) ORDER BY k.created_at DESC LIMIT 1`).bind(scriptId, ownerId).first();
}
async function generateEmbeddedLoader(request, env, requestId, scriptId) {
  if (!isEnabled(env, 'FREZEN_EMBEDDED_LOADER_ENABLED')) return json({ error: 'EMBEDDED_LOADER_DISABLED', request_id: requestId }, 403, requestId);
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', request_id: requestId }, 405, requestId);
  if (!env.DB) return json({ error: 'DATABASE_UNAVAILABLE', request_id: requestId }, 503, requestId);
  if (!env.FREZEN_MASTER_SECRET || env.FREZEN_MASTER_SECRET.length < 32) return json({ error: 'EMBEDDED_LOADER_NOT_CONFIGURED', request_id: requestId }, 503, requestId);
  const access = await requirePrivateAccess(request, env, requestId); if (access instanceof Response) return access;
  let body = {}; try { body = await request.json(); } catch {}
  const script = await findScriptForOwner(env, scriptId, access.user_id); if (!script) return json({ error: 'SCRIPT_NOT_FOUND', request_id: requestId }, 404, requestId);
  if (String(script.status).toUpperCase() !== 'ACTIVE') return json({ error: 'SCRIPT_DISABLED', request_id: requestId }, 409, requestId);
  const record = await chooseKeyRecord(env, scriptId, access.user_id, String(body?.key_record_id ?? '').trim());
  if (!record) return json({ error: 'ACTIVE_DELIVERY_LICENSE_NOT_FOUND', request_id: requestId }, 404, requestId);
  if (String(record.license_status ?? '').toLowerCase() !== 'active') return json({ error: 'LICENSE_BLOCKED', request_id: requestId }, 403, requestId);
  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) return json({ error: 'LICENSE_EXPIRED', request_id: requestId }, 403, requestId);
  const token = await createEmbeddedDeliveryToken(env, scriptId, record.id);
  const source = buildEmbeddedLoaderSource(request, scriptId, token);
  return json({ loader_type: 'embedded', enabled: true, script_id: scriptId, key_record_id: record.id, license_id: record.license_id, source, request_id: requestId }, 200, requestId);
}
async function deliverWithEmbeddedToken(request, env, requestId, scriptId) {
  const url = new URL(request.url); const token = url.searchParams.get('delivery_token')?.trim() ?? '';
  if (!token) return null; if (!isEnabled(env, 'FREZEN_EMBEDDED_LOADER_ENABLED')) return text('EMBEDDED_LOADER_DISABLED', 403, requestId);
  const payload = await verifyEmbeddedDeliveryToken(env, token); if (!payload || payload.scriptId !== scriptId) return text('INVALID_DELIVERY_TOKEN', 403, requestId);
  if (!env.DB) return text('SCRIPT_DELIVERY_UNAVAILABLE', 503, requestId);
  try {
    const row = await env.DB.prepare(`SELECT k.id,k.service_id,k.license_id,k.key_secret_ciphertext,l.status AS license_status,l.expires_at,s.service_id AS script_service_id,s.status AS script_status FROM frezen_key_records k JOIN licenses l ON l.id=k.license_id JOIN scripts s ON s.id=?1 WHERE k.id=?2 LIMIT 1`).bind(scriptId,payload.keyRecordId).first();
    if (!row || row.service_id !== row.script_service_id) return text('DELIVERY_TOKEN_SCOPE_MISMATCH',403,requestId);
    if (String(row.script_status).toUpperCase() !== 'ACTIVE') return text('SCRIPT_INACTIVE',403,requestId);
    if (String(row.license_status ?? '').toLowerCase() !== 'active') return text('LICENSE_BLOCKED',403,requestId);
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return text('LICENSE_EXPIRED',403,requestId);
    if (!row.key_secret_ciphertext) return text('DELIVERY_CREDENTIAL_UNAVAILABLE',503,requestId);
    const licenseKey = await decryptKeySecret(env.FREZEN_MASTER_SECRET,row.key_secret_ciphertext);
    const forwarded = new URL(request.url); forwarded.searchParams.delete('delivery_token'); forwarded.searchParams.set('key',licenseKey);
    const response = await deliverScriptFileByKey(new Request(forwarded.toString(),request),env,requestId,scriptId);
    const headers = new Headers(response.headers); headers.set('x-frezen-loader-mode','embedded'); headers.set('x-frezen-delivery-token','verified');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  } catch (error) { console.error('embedded loader delivery failed',{requestId,scriptId,message:String(error?.message||error)}); return text('SCRIPT_DELIVERY_UNAVAILABLE',503,requestId); }
}

async function requireDeliveryAdmin(request, env, requestId) { const access = await requirePrivateAccess(request, env, requestId); return access instanceof Response ? access : access; }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url); const requestId = crypto.randomUUID();

    const deliveryPublicMatch = url.pathname.match(/^\/delivery\/([^/]+)\/?$/i);
    if (deliveryPublicMatch) return deliverPublicScript(request, env, requestId, decodeURIComponent(deliveryPublicMatch[1]));

    if (url.pathname === '/api/v1/script-delivery') {
      const access = await requireDeliveryAdmin(request, env, requestId); if (access instanceof Response) return access;
      if (request.method === 'GET') return listDeliveryScripts(request, env, requestId, json);
      if (request.method === 'POST') return createDeliveryScript(request, env, requestId, json, access);
      return json({ error: 'METHOD_NOT_ALLOWED', request_id: requestId },405,requestId);
    }
    const deliveryMatch = url.pathname.match(/^\/api\/v1\/script-delivery\/([^/]+)$/);
    if (deliveryMatch) {
      const access = await requireDeliveryAdmin(request, env, requestId); if (access instanceof Response) return access;
      const id = decodeURIComponent(deliveryMatch[1]);
      if (request.method === 'GET') return getDeliveryScript(request, env, requestId, json, id);
      if (request.method === 'PATCH') return updateDeliveryScript(request, env, requestId, json, access, id);
      if (request.method === 'DELETE') return deleteDeliveryScript(request, env, requestId, json, access, id);
      return json({ error: 'METHOD_NOT_ALLOWED', request_id: requestId },405,requestId);
    }
    const deliveryVersions = url.pathname.match(/^\/api\/v1\/script-delivery\/([^/]+)\/versions$/);
    if (deliveryVersions) {
      const access = await requireDeliveryAdmin(request, env, requestId); if (access instanceof Response) return access;
      if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', request_id: requestId },405,requestId);
      return uploadDeliveryVersion(request, env, requestId, json, access, decodeURIComponent(deliveryVersions[1]));
    }
    const deliveryVersionActive = url.pathname.match(/^\/api\/v1\/script-delivery\/([^/]+)\/versions\/([^/]+)\/active$/);
    if (deliveryVersionActive) {
      const access = await requireDeliveryAdmin(request, env, requestId); if (access instanceof Response) return access;
      if (request.method !== 'PATCH') return json({ error: 'METHOD_NOT_ALLOWED', request_id: requestId },405,requestId);
      return activateDeliveryVersion(request, env, requestId, json, access, decodeURIComponent(deliveryVersionActive[1]), decodeURIComponent(deliveryVersionActive[2]));
    }

    const loaderApiMatch = scriptMatch(url.pathname);
    if (loaderApiMatch) return generateEmbeddedLoader(request, env, requestId, decodeURIComponent(loaderApiMatch[1]));
    const fileMatch = url.pathname.match(/^\/files\/([^/]+)\.lua\/?$/i);
    if (fileMatch && url.searchParams.has('delivery_token')) return deliverWithEmbeddedToken(request, env, requestId, decodeURIComponent(fileMatch[1]));
    if (!isEnabled(env, 'FREZEN_KEY_LOADER_ENABLED')) {
      const loaderMatch = url.pathname.match(/^\/(?:loader|compact-loader)\/([^/]+)\/?$/); if (loaderMatch || url.pathname.startsWith('/loader/')) return text('KEY_LOADER_DISABLED',403,requestId);
      if (url.pathname.match(/^\/files\/([^/]+)\.lua\/?$/i) && url.searchParams.has('key')) return text('KEY_LOADER_DISABLED',403,requestId);
    }
    return baseEntry.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) { if (typeof baseEntry.scheduled === 'function') return baseEntry.scheduled(controller, env, ctx); },
};
