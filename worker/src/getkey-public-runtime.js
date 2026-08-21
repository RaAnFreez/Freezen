import { createSafeLinkUShortLink } from './safelinku.js';
import { encryptKeySecret, decryptKeySecret } from './key-secret.js';

const SESSION_COOKIE = 'frezen_getkey_session';
const SESSION_TTL_SECONDS = 30 * 60;
const TOKEN_TTL_SECONDS = 20 * 60;
const NO_STORE = { 'cache-control': 'no-store' };

const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE, ...extraHeaders },
});

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function nowIso() { return new Date().toISOString(); }
function futureIso(seconds) { return new Date(Date.now() + seconds * 1000).toISOString(); }
function newToken() { return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''); }

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes = 4) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function makeLicenseKey() {
  return `NX-${randomHex()}-${randomHex()}-${randomHex()}-${randomHex()}`;
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function sessionCookie(sessionId) {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function loadService(env, slug) {
  if (!env?.DB) return { error: 'DATABASE_UNAVAILABLE', status: 503 };
  const service = await env.DB.prepare('SELECT id, name, slug, description, active FROM frezen_key_services WHERE slug = ?1 LIMIT 1').bind(String(slug || '').trim().toLowerCase()).first();
  if (!service || !service.active) return { error: 'SERVICE_NOT_FOUND', status: 404 };
  const provider = await env.DB.prepare(`SELECT id, name, type, service_id, checkpoints_json, active
    FROM frezen_key_providers WHERE service_id = ?1 AND active = 1 ORDER BY updated_at DESC LIMIT 1`).bind(service.id).first();
  if (!provider) return { error: 'PROVIDER_NOT_CONFIGURED', status: 409 };
  let checkpointIds = [];
  try {
    const parsed = JSON.parse(provider.checkpoints_json || '[]');
    checkpointIds = [...new Set((Array.isArray(parsed) ? parsed : []).map((item) => {
      if (typeof item === 'string') return item.trim();
      return String(item?.id || item?.checkpoint_id || item?.reference || '').trim();
    }).filter(Boolean))];
  } catch { checkpointIds = []; }
  if (!checkpointIds.length) return { error: 'CHECKPOINTS_NOT_CONFIGURED', status: 409 };
  const rows = await env.DB.prepare(`SELECT id, name, type, url, active FROM frezen_key_checkpoints
    WHERE id IN (${checkpointIds.map(() => '?').join(',')})`).bind(...checkpointIds).all();
  const byId = new Map((rows?.results || []).map((row) => [row.id, row]));
  const checkpoints = checkpointIds.map((id) => byId.get(id)).filter((row) => row?.active);
  if (!checkpoints.length) return { error: 'CHECKPOINTS_NOT_FOUND', status: 409 };
  return { service, provider, checkpoints };
}

async function getSession(env, sessionId) {
  if (!env?.DB || !sessionId) return null;
  const session = await env.DB.prepare('SELECT * FROM getkey_public_sessions WHERE id = ?1 LIMIT 1').bind(sessionId).first();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare('DELETE FROM getkey_public_sessions WHERE id = ?1').bind(sessionId).run().catch(() => {});
    return null;
  }
  await env.DB.prepare('UPDATE getkey_public_sessions SET last_seen_at = datetime(\'now\') WHERE id = ?1').bind(sessionId).run().catch(() => {});
  return session;
}

async function ensureSession(request, env, serviceId) {
  const existingId = readCookie(request, SESSION_COOKIE);
  const existing = await getSession(env, existingId);
  if (existing && existing.service_id === serviceId) return { session: existing, setCookie: null };
  const id = crypto.randomUUID();
  const expires = futureIso(SESSION_TTL_SECONDS);
  await env.DB.prepare(`INSERT INTO getkey_public_sessions (id, service_id, created_at, last_seen_at, expires_at)
    VALUES (?1, ?2, ?3, ?3, ?4)`).bind(id, serviceId, nowIso(), expires).run();
  return { session: { id, service_id: serviceId, expires_at: expires }, setCookie: sessionCookie(id) };
}

async function buildCheckpointRows(env, sessionId, checkpoints) {
  for (let i = 0; i < checkpoints.length; i += 1) {
    await env.DB.prepare(`INSERT OR IGNORE INTO getkey_public_checkpoints
      (id, session_id, step_index, checkpoint_id, status, created_at)
      VALUES (?1, ?2, ?3, ?4, 'pending', datetime('now'))`)
      .bind(crypto.randomUUID(), sessionId, i + 1, checkpoints[i].id).run();
  }
  return env.DB.prepare(`SELECT id, session_id, step_index, checkpoint_id, status, verify_token_hash, token_expires_at, short_url, verified_at
    FROM getkey_public_checkpoints WHERE session_id = ?1 ORDER BY step_index ASC`).bind(sessionId).all();
}

function publicState(session, checkpointRows) {
  const rows = checkpointRows?.results || checkpointRows || [];
  const completed = rows.filter((row) => row.status === 'passed');
  const next = rows.find((row) => row.status !== 'passed') || null;
  return {
    session_id: session.id,
    status: next ? 'PENDING' : 'COMPLETED',
    total: rows.length,
    passed_count: completed.length,
    current_step: next?.step_index || rows.length,
    next_checkpoint_id: next?.checkpoint_id || null,
    expires_at: session.expires_at,
    completed: completed.map((row) => row.checkpoint_id),
  };
}

async function issueLicense(env, sessionId) {
  const existing = await env.DB.prepare('SELECT * FROM getkey_public_keys WHERE session_id = ?1 LIMIT 1').bind(sessionId).first();
  if (existing) return { licenseId: existing.license_id, keyId: sessionId, alreadyIssued: true };

  const licenseKey = makeLicenseKey();
  const keyHash = await sha256Hex(licenseKey);
  const licenseId = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO licenses (id, license_key_hash, product_id, user_id, status, created_at, updated_at, expires_at)
    VALUES (?1, ?2, NULL, NULL, 'active', datetime('now'), datetime('now'), NULL)`)
    .bind(licenseId, keyHash).run();

  let ciphertext = null;
  if (env.FREZEN_MASTER_SECRET) {
    ciphertext = await encryptKeySecret(env.FREZEN_MASTER_SECRET, licenseKey);
  }
  await env.DB.prepare(`INSERT INTO getkey_public_keys (session_id, license_id, key_hash, key_ciphertext, created_at)
    VALUES (?1, ?2, ?3, ?4, datetime('now'))`)
    .bind(sessionId, licenseId, keyHash, ciphertext).run();
  await env.DB.prepare('UPDATE getkey_public_sessions SET issued_license_id = ?1 WHERE id = ?2').bind(licenseId, sessionId).run();
  return { licenseId, keyId: sessionId, licenseKey, alreadyIssued: false };
}

export async function startPublicGetKey(request, env, slug) {
  const config = await loadService(env, slug);
  if (config.error) return json({ error: config.error }, config.status);
  try {
    const { session, setCookie } = await ensureSession(request, env, config.service.id);
    const rows = await buildCheckpointRows(env, session.id, config.checkpoints);
    const state = publicState(session, rows);
    return json({ flow_id: session.id, service: { id: config.service.id, name: config.service.name, slug: config.service.slug }, state, checkpoints: config.checkpoints.map((checkpoint, index) => ({ checkpoint_id: checkpoint.id, name: checkpoint.name, type: checkpoint.type, step: index + 1 })) }, 200, setCookie ? { 'set-cookie': setCookie } : {});
  } catch (error) {
    console.error('GetKey start failed', { message: String(error?.message || error) });
    return json({ error: 'DATABASE_ERROR' }, 503);
  }
}

export async function getPublicGetKeyState(request, env, flowId) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId || sessionId !== flowId) return json({ error: 'SESSION_MISMATCH' }, 403);
  const session = await getSession(env, sessionId);
  if (!session) return json({ error: 'FLOW_NOT_FOUND' }, 404);
  const config = await loadService(env, session.service_id);
  if (config.error) return json({ error: config.error }, config.status);
  try {
    const rows = await buildCheckpointRows(env, session.id, config.checkpoints);
    const state = publicState(session, rows);
    const items = rows.results || [];
    const next = items.find((row) => row.status !== 'passed');
    const names = new Map(config.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.name]));
    return json({ flow_id: session.id, state, checkpoints: items.map((row) => ({ checkpoint_id: row.checkpoint_id, name: names.get(row.checkpoint_id) || row.checkpoint_id, status: row.status === 'passed' ? 'COMPLETED' : 'PENDING', step: row.step_index, has_active_link: Boolean(row.short_url && row.status !== 'passed'), link_expires_at: row.token_expires_at })), next_checkpoint: next ? { checkpoint_id: next.checkpoint_id, name: names.get(next.checkpoint_id) || next.checkpoint_id, launch_path: `/api/v1/get-key/flow/${encodeURIComponent(flowId)}/launch` } : null });
  } catch (error) {
    console.error('GetKey state failed', { message: String(error?.message || error) });
    return json({ error: 'DATABASE_ERROR' }, 503);
  }
}

export async function launchPublicGetKeyCheckpoint(request, env, flowId) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId || sessionId !== flowId) return json({ error: 'SESSION_MISMATCH' }, 403);
  const session = await getSession(env, sessionId);
  if (!session) return json({ error: 'FLOW_NOT_FOUND' }, 404);
  const config = await loadService(env, session.service_id);
  if (config.error) return json({ error: config.error }, config.status);

  try {
    const rows = await buildCheckpointRows(env, session.id, config.checkpoints);
    const next = (rows.results || []).find((row) => row.status !== 'passed');
    if (!next) return json({ error: 'FLOW_COMPLETE' }, 409);
    const token = newToken();
    const tokenHash = await sha256Hex(token);
    const expires = futureIso(TOKEN_TTL_SECONDS);
    const callback = new URL('/api/v1/get-key/checkpoint/callback', request.url);
    callback.searchParams.set('token', token);
    const created = await createSafeLinkUShortLink(env, callback.toString(), { alias: `frezen-${session.id.slice(0, 8)}-${next.step_index}` });
    if (created.status !== 'ok' || !created.url) return json({ error: created.error || 'SAFELINKU_LINK_CREATION_FAILED', provider: 'safelinku', http_status: created.http_status }, created.http_status >= 400 ? Math.min(created.http_status, 503) : 503);

    await env.DB.prepare(`UPDATE getkey_public_checkpoints
      SET verify_token_hash = ?1, token_expires_at = ?2, short_url = ?3
      WHERE id = ?4 AND session_id = ?5`)
      .bind(tokenHash, expires, created.url, next.id, session.id).run();
    return new Response(null, { status: 302, headers: { location: created.url, 'set-cookie': sessionCookie(session.id), ...NO_STORE } });
  } catch (error) {
    console.error('GetKey checkpoint launch failed', { message: String(error?.message || error) });
    return json({ error: 'DATABASE_ERROR' }, 503);
  }
}

export async function verifyPublicGetKeyCallback(request, env, token) {
  const value = String(token || '').trim();
  if (!/^[A-Za-z0-9]{40,96}$/.test(value)) return json({ error: 'INVALID_VERIFICATION_TOKEN' }, 400);
  const tokenHash = await sha256Hex(value);
  const sessionId = readCookie(request, SESSION_COOKIE);
  try {
    const row = await env.DB.prepare(`SELECT c.id, c.session_id, c.step_index, c.checkpoint_id, c.status, c.token_expires_at,
      s.service_id, s.expires_at AS session_expires_at
      FROM getkey_public_checkpoints c
      JOIN getkey_public_sessions s ON s.id = c.session_id
      WHERE c.verify_token_hash = ?1 LIMIT 1`).bind(tokenHash).first();
    if (!row) return json({ error: 'VERIFICATION_TOKEN_NOT_FOUND' }, 404);
    if (!sessionId || sessionId !== row.session_id) return json({ error: 'SESSION_MISMATCH' }, 403);
    if (new Date(row.session_expires_at).getTime() <= Date.now() || (row.token_expires_at && new Date(row.token_expires_at).getTime() <= Date.now())) return json({ error: 'TOKEN_EXPIRED' }, 410);
    if (row.status === 'passed') return json({ error: 'TOKEN_ALREADY_USED' }, 409);

    const result = await env.DB.prepare(`UPDATE getkey_public_checkpoints
      SET status = 'passed', verified_at = datetime('now'), verify_token_hash = NULL, token_expires_at = NULL, short_url = NULL
      WHERE id = ?1 AND session_id = ?2 AND verify_token_hash = ?3 AND status != 'passed'`)
      .bind(row.id, row.session_id, tokenHash).run();
    if (!result?.meta?.changes) return json({ error: 'VERIFICATION_RACE' }, 409);

    const rows = await env.DB.prepare('SELECT step_index, checkpoint_id, status FROM getkey_public_checkpoints WHERE session_id = ?1 ORDER BY step_index ASC').bind(row.session_id).all();
    const allPassed = (rows.results || []).length > 0 && rows.results.every((item) => item.status === 'passed');
    if (allPassed) await issueLicense(env, row.session_id);

    const service = await env.DB.prepare('SELECT slug FROM frezen_key_services WHERE id = ?1 LIMIT 1').bind(row.service_id).first();
    if (!service?.slug) return json({ error: 'SERVICE_NOT_FOUND' }, 404);
    const location = `/get-key/${encodeURIComponent(service.slug)}?flow=${encodeURIComponent(row.session_id)}&verified=1${allPassed ? '&unlocked=1' : ''}`;
    return new Response(null, { status: 302, headers: { location, 'set-cookie': sessionCookie(row.session_id), ...NO_STORE } });
  } catch (error) {
    console.error('GetKey callback failed', { message: String(error?.message || error) });
    return json({ error: 'DATABASE_ERROR' }, 503);
  }
}

export async function getPublicGetKeyLicense(request, env, flowId) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId || sessionId !== flowId) return json({ error: 'SESSION_MISMATCH' }, 403);
  const row = await env.DB.prepare('SELECT license_id, key_ciphertext, created_at FROM getkey_public_keys WHERE session_id = ?1 LIMIT 1').bind(sessionId).first();
  if (!row) return json({ unlocked: false, key: null });
  if (!row.key_ciphertext || !env.FREZEN_MASTER_SECRET) return json({ unlocked: true, key: null, error: 'KEY_SECRET_UNAVAILABLE' }, 503);
  try {
    const key = await decryptKeySecret(env.FREZEN_MASTER_SECRET, row.key_ciphertext);
    return json({ unlocked: true, key, license_id: row.license_id, generated_at: row.created_at });
  } catch (error) {
    console.error('GetKey license decrypt failed', { message: String(error?.message || error) });
    return json({ unlocked: true, key: null, error: 'KEY_SECRET_INVALID' }, 503);
  }
}

export async function validatePublicGetKeyLicense(request, env) {
  let body = {};
  try { body = await request.json(); } catch { return json({ valid: false, error: 'INVALID_JSON' }, 400); }
  const value = String(body?.key || '').trim().toUpperCase();
  if (!value || value.length > 128) return json({ valid: false }, 400);
  try {
    const hash = await sha256Hex(value);
    const row = await env.DB.prepare(`SELECT id, status, expires_at FROM licenses WHERE license_key_hash = ?1 LIMIT 1`).bind(hash).first();
    if (!row) return json({ valid: false });
    if (row.status === 'revoked' || row.status === 'banned') return json({ valid: false });
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return json({ valid: false });
    return json({ valid: true, license_id: row.id, status: row.status });
  } catch (error) {
    console.error('GetKey key validation failed', { message: String(error?.message || error) });
    return json({ valid: false, error: 'DATABASE_ERROR' }, 503);
  }
}

export function publicGetKeyPage(slug) {
  const safeSlug = escapeHtml(slug);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>Frezen — Get Key</title><style>:root{color-scheme:dark;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#070a10;color:#f5f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:18px;background:radial-gradient(circle at top,#1a2744,#070a10 62%)}main{width:min(100%,560px);margin:0 auto;border:1px solid #263047;border-radius:22px;padding:24px;background:#0f1521;box-shadow:0 24px 70px #0008}h1{margin:0 0 6px;font-size:28px}p{color:#a9b2c4;line-height:1.5}.small{font-size:12px;color:#77849a}.progress{margin:22px 0 16px;height:8px;background:#1e2737;border-radius:999px;overflow:hidden}.bar{height:100%;width:0;background:#9b5cff;transition:width .25s}.card{border:1px solid #263047;border-radius:16px;padding:18px;background:#111a29}.row{display:flex;gap:12px;align-items:center}.badge{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;background:#1b2b22;color:#5be08b;flex:none}.label{font-size:13px;color:#8f9aaf}.name{font-weight:700;margin-top:2px}.actions{margin-top:18px;display:grid;gap:10px}button{width:100%;border:0;border-radius:12px;padding:13px 15px;font:inherit;font-weight:700;cursor:pointer;background:#a55cff;color:#fff}button.secondary{background:#1c2534;color:#dbe2ef}button:disabled{opacity:.5;cursor:not-allowed}.checkpoint-list{display:grid;gap:10px;margin-top:16px}.checkpoint-item{display:flex;gap:12px;align-items:center;padding:12px;border:1px solid #263047;border-radius:12px;background:#0f1826}.checkpoint-item .number{width:28px;height:28px;display:grid;place-items:center;border-radius:9px;background:#1c2534;color:#b9c4d5;font-weight:700;flex:none}.checkpoint-item.done .number{background:#183624;color:#5be08b}.checkpoint-item.current{border-color:#8d54e8}.meta{min-width:0}.meta strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta span{display:block;margin-top:2px;font-size:12px;color:#7f8ba0}.status{margin-top:16px;padding:12px;border-radius:12px;background:#101826;white-space:pre-wrap;color:#dbe2ef}.error{color:#ffb4b4;background:#29171b}.key{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;word-break:break-all;padding:14px;border-radius:12px;background:#0a0f18;margin-top:12px}</style></head><body><main><h1>FREZEN</h1><p>Complete every required checkpoint to receive your key.</p><div id="service" class="small">Service: ${safeSlug}</div><div class="progress"><div id="bar" class="bar"></div></div><div class="card"><div class="row"><div id="badge" class="badge">1</div><div><div id="step" class="label">Get-Key</div><div id="checkpoint" class="name">Ready to start</div></div></div><div id="checkpoints" class="checkpoint-list"></div><div class="actions"><button id="start">Start Get-Key Flow</button><button id="open" class="secondary" disabled>Open Current Checkpoint</button></div><div id="keybox" hidden><div class="label">Your Frezen Key</div><div id="key" class="key"></div></div></div><div id="status" class="status" hidden></div><p class="small">Each checkpoint uses a one-time browser-bound callback token. A normal visit to the callback cannot skip a checkpoint.</p></main><script>
const slug=${JSON.stringify(slug)};const params=new URLSearchParams(location.search);const start=document.getElementById('start');const open=document.getElementById('open');const status=document.getElementById('status');const bar=document.getElementById('bar');const badge=document.getElementById('badge');const step=document.getElementById('step');const checkpoint=document.getElementById('checkpoint');const checkpoints=document.getElementById('checkpoints');const keybox=document.getElementById('keybox');const keyEl=document.getElementById('key');let flowId=params.get('flow')||null;const show=(text,error=false)=>{status.hidden=false;status.textContent=text;status.className='status'+(error?' error':'')};const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function req(path,options={}){const r=await fetch(path,{headers:{accept:'application/json','content-type':'application/json'},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||('HTTP '+r.status));return d}function render(d){const s=d.state||{};const list=d.checkpoints||[];const total=s.total||list.length||0;bar.style.width=(total?Math.round((s.passed_count||0)/total*100):0)+'%';badge.textContent=String(s.current_step||1);step.textContent=total?'Checkpoint '+Math.min((s.current_step||1),total)+' of '+total:'Get-Key';checkpoint.textContent=d.next_checkpoint?.name||'All checkpoints complete';checkpoints.innerHTML=list.map((item,i)=>'<div class="checkpoint-item '+(item.status==='COMPLETED'?'done ':'')+(item.checkpoint_id===s.next_checkpoint_id?'current':'')+'"><div class="number">'+(i+1)+'</div><div class="meta"><strong>'+esc(item.name)+'</strong><span>'+(item.status==='COMPLETED'?'Completed':item.checkpoint_id===s.next_checkpoint_id?'Current':'Waiting')+'</span></div></div>').join('');open.disabled=!d.next_checkpoint;open.dataset.launch=d.next_checkpoint?d.next_checkpoint.launch_path:'';if(s.status==='COMPLETED'){start.style.display='none';open.disabled=true;checkpoint.textContent='All checkpoints complete';show('All checkpoints completed. Your key is being prepared…');loadKey()}else{start.style.display='none';if(params.get('verified')==='1')show('Checkpoint verified. Continue with the next checkpoint.')}}async function refresh(){if(!flowId)return;try{const d=await req('/api/v1/get-key/flow/'+encodeURIComponent(flowId));render(d)}catch(e){show(e.message,true)}}async function loadKey(){if(!flowId)return;try{const d=await req('/api/v1/get-key/key/'+encodeURIComponent(flowId));if(d.key){keyEl.textContent=d.key;keybox.hidden=false;show('All checkpoints completed. Keep this key safe.')}}catch(e){show(e.message,true)}}start.onclick=async()=>{start.disabled=true;show('Creating checkpoint flow…');try{const d=await req('/api/v1/get-key/flow/start?slug='+encodeURIComponent(slug),{method:'POST',body:JSON.stringify({slug})});flowId=d.flow_id;history.replaceState(null,'','/get-key/'+encodeURIComponent(slug)+'?flow='+encodeURIComponent(flowId));render(d)}catch(e){show(e.message,true)}finally{start.disabled=false}};open.onclick=()=>{if(open.dataset.launch)location.href=open.dataset.launch};if(flowId){start.style.display='none';show(params.get('verified')==='1'?'Checkpoint verified. Loading…':'Resuming flow…');refresh();if(params.get('unlocked')==='1')loadKey()}
</script></body></html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE } });
}
