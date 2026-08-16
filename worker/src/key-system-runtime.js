import { createCheckpointFlow, getCheckpointFlow, startNextCheckpoint } from './getkey-checkpoint-flow.js';

const TTL_SECONDS = 30 * 60;
const NO_STORE = { 'cache-control': 'no-store' };

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE },
});

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const publicPage = (slug) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>Frezen — Get Key</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#070a10;color:#f5f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:18px;background:radial-gradient(circle at top,#1a2744,#070a10 62%)}main{width:min(100%,560px);margin:0 auto;border:1px solid #263047;border-radius:22px;padding:24px;background:#0f1521;box-shadow:0 24px 70px #0008}h1{margin:0 0 6px;font-size:28px}p{color:#a9b2c4;line-height:1.5}.progress{margin:22px 0 16px;height:8px;background:#1e2737;border-radius:999px;overflow:hidden}.bar{height:100%;width:0;background:#9b5cff;transition:width .25s}.card{border:1px solid #263047;border-radius:16px;padding:18px;background:#111a29}.row{display:flex;gap:12px;align-items:center}.badge{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;background:#1b2b22;color:#5be08b;flex:none}.label{font-size:13px;color:#8f9aaf}.name{font-weight:700;margin-top:2px}.actions{margin-top:18px;display:grid;gap:10px}button{width:100%;border:0;border-radius:12px;padding:13px 15px;font:inherit;font-weight:700;cursor:pointer;background:#a55cff;color:#fff}button.secondary{background:#1c2534;color:#dbe2ef}button:disabled{opacity:.5;cursor:not-allowed}.checkpoint-list{display:grid;gap:10px;margin-top:16px}.checkpoint-item{display:flex;gap:12px;align-items:center;padding:12px;border:1px solid #263047;border-radius:12px;background:#0f1826}.checkpoint-item .number{width:28px;height:28px;display:grid;place-items:center;border-radius:9px;background:#1c2534;color:#b9c4d5;font-weight:700;flex:none}.checkpoint-item.done .number{background:#183624;color:#5be08b}.checkpoint-item.current{border-color:#8d54e8}.checkpoint-item .meta{min-width:0}.checkpoint-item .meta strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.checkpoint-item .meta span{display:block;margin-top:2px;font-size:12px;color:#7f8ba0}.status{margin-top:16px;padding:12px;border-radius:12px;background:#101826;white-space:pre-wrap;color:#dbe2ef}.small{font-size:12px;color:#77849a}.error{color:#ffb4b4;background:#29171b}
</style></head>
<body><main>
<h1>FREZEN</h1><p>Complete every required checkpoint to continue to your key.</p>
<div id="service" class="small">Service: ${escapeHtml(slug)}</div>
<div class="progress"><div id="bar" class="bar"></div></div>
<div class="card"><div class="row"><div id="badge" class="badge">1</div><div><div id="step" class="label">Checkpoint</div><div id="checkpoint" class="name">Waiting to start…</div></div></div><div id="checkpoints" class="checkpoint-list"></div><div class="actions"><button id="start">Start Get-Key Flow</button><button id="open" class="secondary" disabled>Open Current Checkpoint</button></div></div>
<div id="status" class="status" hidden></div><p class="small">Checkpoint completion remains server-side. Returning to Frezen alone does not mark a checkpoint complete.</p>
<script>
const slug=${JSON.stringify(slug)};
const start=document.getElementById('start'); const open=document.getElementById('open'); const status=document.getElementById('status'); const bar=document.getElementById('bar'); const badge=document.getElementById('badge'); const step=document.getElementById('step'); const checkpoint=document.getElementById('checkpoint'); const checkpoints=document.getElementById('checkpoints');
let flowId=null;
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=(text,error=false)=>{status.hidden=false;status.textContent=text;status.className='status'+(error?' error':'');};
async function req(path,options={}){const r=await fetch(path,{headers:{accept:'application/json','content-type':'application/json'},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||('HTTP '+r.status));return d;}
function renderCheckpoints(items,state){const completed=new Set(state.completed||[]);checkpoints.innerHTML=(items||[]).map((item,index)=>{const done=completed.has(item.checkpoint_id)||item.status==='COMPLETED';const current=item.checkpoint_id===state.next_checkpoint_id;const label=done?'Completed':current?'Current':'Waiting';return '<div class="checkpoint-item '+(done?'done ':'')+(current?'current':'')+'"><div class="number">'+(index+1)+'</div><div class="meta"><strong>'+escapeHtml(item.name||('Checkpoint '+(index+1)))+'</strong><span>'+label+'</span></div></div>';}).join('');}
async function refresh(){if(!flowId)return;try{const d=await req('/api/v1/get-key/flow/'+encodeURIComponent(flowId));const s=d.state||{};const list=d.checkpoints||[];const total=s.total||list.length||0;const pct=total?Math.round(((s.completed||[]).length/total)*100):0;bar.style.width=pct+'%';const currentIndex=Math.min(s.current_index||0,Math.max(total-1,0));badge.textContent=String(total?currentIndex+1:1);step.textContent='Checkpoint '+(total?currentIndex+1:0)+' of '+total;checkpoint.textContent=d.next_checkpoint?.name||'All checkpoints complete';renderCheckpoints(list,s);open.disabled=!d.next_checkpoint?.launch_path;open.dataset.launch=d.next_checkpoint?.launch_path||'';if(s.status==='COMPLETED')show('All checkpoints are completed. Key issuance will remain blocked until trusted SafeLinkU completion is available.');}catch(e){show(e.message,true);}}
start.onclick=async()=>{start.disabled=true;show('Creating checkpoint flow…');try{const d=await req('/api/v1/get-key/flow/start?slug='+encodeURIComponent(slug),{method:'POST',body:JSON.stringify({slug})});flowId=d.flow_id;show('Flow created. Start with checkpoint 1.');await refresh();}catch(e){show(e.message,true)}finally{start.disabled=false;}};
open.onclick=()=>{const path=open.dataset.launch;if(path)location.href=path;};
</script></main></body></html>`;

function cleanId(value, max = 128) {
  const id = typeof value === 'string' ? value.trim() : '';
  return id && id.length <= max ? id : null;
}
function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}
function parseArray(value) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function normalizeCheckpointRefs(value) {
  const raw = Array.isArray(value) ? value : parseArray(value);
  return [...new Set(raw.map((item) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') return String(item.id || item.checkpoint_id || item.reference || '').trim();
    return '';
  }).filter(Boolean))];
}

export async function syncKeySystemConfig(request, env, access) {
  if (!env?.DB || !access?.user_id) return json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  const services = Array.isArray(body?.services) ? body.services : [];
  const providers = Array.isArray(body?.providers) ? body.providers : [];
  const checkpoints = Array.isArray(body?.checkpoints) ? body.checkpoints : [];
  const now = new Date().toISOString();
  try {
    for (const service of services) {
      const id = cleanId(service?.id); const slug = slugify(service?.slug);
      if (!id || !slug) continue;
      const current = await env.DB.prepare('SELECT id, slug FROM frezen_key_services WHERE id = ?1 LIMIT 1').bind(id).first();
      if (current?.slug && current.slug !== slug) {
        await env.DB.prepare('INSERT OR IGNORE INTO frezen_key_service_aliases (slug, service_id) VALUES (?1, ?2)').bind(current.slug, id).run();
      }
      await env.DB.prepare(`INSERT INTO frezen_key_services (id, owner_id, name, slug, description, premium, keyless, keyless_days_json, active, created_at, updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,COALESCE((SELECT created_at FROM frezen_key_services WHERE id=?1),datetime('now')),?9)
        ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,name=excluded.name,slug=excluded.slug,description=excluded.description,premium=excluded.premium,keyless=excluded.keyless,keyless_days_json=excluded.keyless_days_json,active=1,updated_at=excluded.updated_at`)
        .bind(id, access.user_id, String(service?.name || 'Service').slice(0,100), slug, String(service?.description || '').slice(0,500), service?.premium ? 1 : 0, service?.keyless ? 1 : 0, JSON.stringify(Array.isArray(service?.days) ? service.days : []), now).run();
    }
    for (const provider of providers) {
      const id = cleanId(provider?.id); const serviceId = cleanId(provider?.service_id);
      if (!id || !serviceId) continue;
      const checkpointIds = normalizeCheckpointRefs(provider?.checkpoints);
      await env.DB.prepare(`INSERT INTO frezen_key_providers (id, owner_id, service_id, name, type, active, checkpoints_json, settings_json, created_at, updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,COALESCE((SELECT created_at FROM frezen_key_providers WHERE id=?1),datetime('now')),?9)
        ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,service_id=excluded.service_id,name=excluded.name,type=excluded.type,active=excluded.active,checkpoints_json=excluded.checkpoints_json,settings_json=excluded.settings_json,updated_at=excluded.updated_at`)
        .bind(id, access.user_id, serviceId, String(provider?.name || 'Provider').slice(0,100), String(provider?.type || 'safelinku').slice(0,40), provider?.active === false ? 0 : 1, JSON.stringify(checkpointIds), JSON.stringify(provider || {}), now).run();
    }
    for (const checkpoint of checkpoints) {
      const id = cleanId(checkpoint?.id); if (!id) continue;
      const reference = typeof checkpoint?.reference === 'string' ? checkpoint.reference : (typeof checkpoint?.url === 'string' ? checkpoint.url : null);
      await env.DB.prepare(`INSERT INTO frezen_key_checkpoints (id, owner_id, name, type, url, active, metadata_json, created_at, updated_at)
        VALUES (?1,?2,?3,?4,?5,1,?6,COALESCE((SELECT created_at FROM frezen_key_checkpoints WHERE id=?1),datetime('now')),?7)
        ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,name=excluded.name,type=excluded.type,url=excluded.url,active=1,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
        .bind(id, access.user_id, String(checkpoint?.name || 'Checkpoint').slice(0,100), String(checkpoint?.type || 'safelinku').slice(0,40), reference ? reference.slice(0,500) : null, JSON.stringify(checkpoint || {}), now).run();
    }
    return json({ synced: true, services: services.length, providers: providers.length, checkpoints: checkpoints.length });
  } catch {
    return json({ error: 'DATABASE_ERROR' }, 503);
  }
}

async function resolveService(env, slug) {
  if (!env?.DB) return { kind: 'error', response: json({ error: 'DATABASE_UNAVAILABLE' }, 503) };
  const normalized = slugify(slug);
  if (!normalized) return { kind: 'error', response: json({ error: 'INVALID_SERVICE_SLUG' }, 400) };
  const service = await env.DB.prepare('SELECT * FROM frezen_key_services WHERE slug = ?1 AND active = 1 LIMIT 1').bind(normalized).first();
  if (service) return { kind: 'service', service };
  const alias = await env.DB.prepare('SELECT service_id FROM frezen_key_service_aliases WHERE slug = ?1 LIMIT 1').bind(normalized).first();
  if (alias) {
    const current = await env.DB.prepare('SELECT * FROM frezen_key_services WHERE id = ?1 AND active = 1 LIMIT 1').bind(alias.service_id).first();
    if (current) return { kind: 'alias', service: current, redirectSlug: current.slug };
  }
  return { kind: 'missing', response: json({ error: 'SERVICE_NOT_FOUND' }, 404) };
}

async function providerForService(env, serviceId) {
  return env.DB.prepare("SELECT * FROM frezen_key_providers WHERE service_id = ?1 AND active = 1 ORDER BY updated_at DESC LIMIT 1").bind(serviceId).first();
}

async function checkpointRowsByIds(env, ids) {
  const normalized = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!normalized.length) return [];
  const rows = await env.DB.prepare(`SELECT id, name, type, url, active FROM frezen_key_checkpoints WHERE id IN (${normalized.map(() => '?').join(',')})`).bind(...normalized).all();
  const byId = new Map((rows?.results || []).map((row) => [row.id, row]));
  return normalized.map((id) => byId.get(id)).filter(Boolean);
}

async function checkpointsForProvider(env, provider) {
  return checkpointRowsByIds(env, normalizeCheckpointRefs(provider?.checkpoints_json));
}

export async function getPublicServiceConfig(env, slug) {
  const result = await resolveService(env, slug);
  if (result.kind === 'missing' || result.kind === 'error') return result.response;
  if (result.kind === 'alias') return json({ status: 'redirect', slug: result.service.slug });
  const provider = await providerForService(env, result.service.id);
  const checkpoints = provider ? await checkpointsForProvider(env, provider) : [];
  return json({ service: { id: result.service.id, name: result.service.name, slug: result.service.slug, description: result.service.description, premium: Boolean(result.service.premium) }, provider: provider ? { id: provider.id, name: provider.name, type: provider.type, total_checkpoints: checkpoints.length } : null });
}

export async function startPublicFlow(request, env, slug) {
  const result = await resolveService(env, slug);
  if (result.kind === 'missing' || result.kind === 'error') return result.response;
  if (result.kind === 'alias') return json({ error: 'SERVICE_SLUG_MOVED', slug: result.service.slug }, 409);
  const provider = await providerForService(env, result.service.id);
  if (!provider) return json({ error: 'PROVIDER_NOT_CONFIGURED' }, 409);
  const checkpoints = await checkpointsForProvider(env, provider);
  if (!checkpoints.length) return json({ error: 'CHECKPOINTS_NOT_CONFIGURED' }, 409);
  if (checkpoints.some((row) => !row.url || !/^https:\/\//i.test(row.url))) return json({ error: 'CHECKPOINT_URLS_INCOMPLETE' }, 409);
  const flow = await createCheckpointFlow(env, { providerId: provider.id, serviceId: result.service.id, productId: result.service.id, checkpointIds: checkpoints.map((row) => row.id) });
  if (!flow.ok) return json({ error: flow.error || 'FLOW_CREATE_FAILED' }, flow.status || 503);
  return json({ ...flow, launch_path: `/api/v1/get-key/flow/${encodeURIComponent(flow.flow_id)}/launch` }, 201);
}

export async function getPublicFlow(env, flowId) {
  const result = await getCheckpointFlow(env, flowId);
  if (!result.ok) return json({ error: result.error }, result.status || 503);
  const items = result.items || [];
  const rows = await checkpointRowsByIds(env, items.map((item) => item.checkpoint_id));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const checkpoints = items.map((item) => {
    const row = byId.get(item.checkpoint_id);
    return { checkpoint_id: item.checkpoint_id, name: row?.name || `Checkpoint ${Number(item.sequence) + 1}`, type: row?.type || 'safelinku', status: item.status, sequence: item.sequence, completed_at: item.completed_at || null };
  });
  const nextId = result.state.next_checkpoint_id;
  const next = nextId ? checkpoints.find((item) => item.checkpoint_id === nextId) : null;
  return json({ flow_id: flowId, state: result.state, checkpoints, next_checkpoint: next ? { ...next, launch_path: `/api/v1/get-key/flow/${encodeURIComponent(flowId)}/launch` } : null });
}

export async function launchPublicFlow(env, flowId) {
  const result = await getCheckpointFlow(env, flowId);
  if (!result.ok) return json({ error: result.error }, result.status || 503);
  const nextId = result.state.next_checkpoint_id;
  if (!nextId) return json({ error: 'FLOW_COMPLETE' }, 409);
  const checkpoint = await env.DB.prepare('SELECT url FROM frezen_key_checkpoints WHERE id = ?1 AND active = 1 LIMIT 1').bind(nextId).first();
  if (!checkpoint?.url || !/^https:\/\//i.test(checkpoint.url)) return json({ error: 'CHECKPOINT_URL_UNAVAILABLE' }, 409);
  await startNextCheckpoint(env, flowId);
  return new Response(null, { status: 302, headers: { location: checkpoint.url, 'set-cookie': `frezen_flow=${encodeURIComponent(flowId)}; Path=/; Max-Age=${TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`, ...NO_STORE } });
}

export async function publicGetKeyPage(env, request, slug) {
  const result = await resolveService(env, slug);
  if (result.kind === 'missing' || result.kind === 'error') return result.response;
  if (result.kind === 'alias') return new Response(null, { status: 302, headers: { location: `/get-key/${encodeURIComponent(result.service.slug)}`, ...NO_STORE } });
  return new Response(publicPage(result.service.slug), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE } });
}
