const NO_STORE = { 'cache-control': 'no-store' };

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}[char] || char));

function pageHtml(slug) {
  const safeSlug = String(slug || '').trim();
  const slugJson = JSON.stringify(safeSlug);
  const fallbackTitle = safeSlug
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Frezen Get-Key';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#0b1020">
<title>Frezen — ${escapeHtml(fallbackTitle)}</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#080d19;color:#edf2fb;--bg:#080d19;--panel:#111a2d;--panel-2:#0d1526;--line:#273554;--muted:#93a0b8;--accent:#a86cff;--accent-2:#8053da;--success:#67d978;--success-2:#2f9f4d;--danger:#ff8f9d}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 15% 5%,rgba(168,108,255,.24),transparent 34%),radial-gradient(circle at 90% 20%,rgba(75,118,255,.18),transparent 28%),linear-gradient(180deg,#0a1020 0%,#10182b 42%,#070b14 100%);overflow-x:hidden}
body:before{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent 18%,rgba(27,45,82,.15) 100%)}
.page{width:min(100%,760px);margin:0 auto;padding:18px 14px 34px;position:relative;z-index:1}
.nav{height:66px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(23,33,57,.92);box-shadow:0 18px 45px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:space-between;padding:0 18px;margin-bottom:22px;backdrop-filter:blur(12px)}
.brand{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:.12em}.brand-mark{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(145deg,#b37cff,#7350c9);box-shadow:0 0 0 3px rgba(168,108,255,.12),0 10px 24px rgba(94,53,157,.3)}
.brand-text{font-size:16px}.menu{width:30px;height:24px;display:grid;align-content:center;gap:5px}.menu span{display:block;height:2px;border-radius:99px;background:#9ea9ba}
.hero{border:1px solid rgba(255,255,255,.08);border-radius:18px;background:linear-gradient(145deg,rgba(28,40,68,.98),rgba(14,21,37,.98));box-shadow:0 25px 70px rgba(0,0,0,.34);padding:24px 20px 22px}
.eyebrow{text-transform:uppercase;font-size:11px;letter-spacing:.16em;color:#7f8ca4;font-weight:800}.title{margin:10px 0 4px;font-size:25px;line-height:1.2}.description{margin:0;color:var(--muted);font-size:13px;line-height:1.6}.progress-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:25px 0 10px;font-weight:800}.progress-label{font-size:16px}.progress-track{height:9px;border-radius:99px;background:#0a120e;border:1px solid rgba(103,217,120,.12);overflow:hidden;box-shadow:inset 0 0 14px rgba(0,0,0,.65)}.progress-fill{height:100%;width:0;background:linear-gradient(90deg,#54c86c,#7ce889);border-radius:99px;transition:width .28s ease;box-shadow:0 0 15px rgba(103,217,120,.18)}
.primary{width:min(100%,190px);margin:24px auto 0;display:flex;align-items:center;justify-content:center;gap:9px;border:2px solid #4fa45d;border-radius:13px;background:linear-gradient(180deg,#72da79,#5cc76a);color:#f6fff7;padding:13px 18px;font:inherit;font-weight:900;letter-spacing:.02em;cursor:pointer;box-shadow:0 7px 20px rgba(55,152,76,.25),inset 0 1px 0 rgba(255,255,255,.2)}.primary:disabled{opacity:.58;cursor:not-allowed}.primary.secondary{background:linear-gradient(180deg,#b57cff,#8c5ddb);border-color:#7d59c1;box-shadow:0 8px 22px rgba(117,72,178,.28)}.primary.small{width:auto;min-width:0;margin:0;padding:9px 13px;font-size:12px;border-width:1px}
.info{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.info-card{padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(11,17,31,.62)}.info-label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#748198}.info-value{margin-top:5px;font-weight:800;font-size:14px}.status-ok{color:#7fe68b}.status-warn{color:#ffcf76}.status-error{color:var(--danger)}
.table{margin-top:18px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(15,23,40,.9);box-shadow:0 20px 50px rgba(0,0,0,.25);overflow:hidden}.table-head,.checkpoint{display:grid;grid-template-columns:1.7fr .8fr .9fr auto;gap:12px;align-items:center}.table-head{padding:16px 16px 12px;color:#b4bfd0;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;border-bottom:1px solid rgba(255,255,255,.07)}.checkpoint{padding:15px 16px;border-bottom:1px solid rgba(255,255,255,.06)}.checkpoint:last-child{border-bottom:0}.checkpoint-name{min-width:0}.checkpoint-name strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}.checkpoint-name span{display:block;margin-top:3px;color:#6f7c92;font-size:11px}.pill{display:inline-flex;align-items:center;justify-content:center;padding:5px 8px;border-radius:999px;font-size:10px;font-weight:900}.pill.pending{background:#253044;color:#aeb9ca}.pill.current{background:rgba(168,108,255,.15);color:#d1b4ff;border:1px solid rgba(168,108,255,.28)}.pill.done{background:rgba(103,217,120,.14);color:#8aef96;border:1px solid rgba(103,217,120,.22)}.action-slot{justify-self:end}.ghost{border:1px solid var(--line);background:#101a2d;color:#c9d2df;border-radius:10px;padding:9px 11px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}.ghost:disabled{opacity:.45;cursor:not-allowed}
.notice{display:none;margin-top:15px;padding:12px 14px;border-radius:12px;background:#121d30;border:1px solid var(--line);color:#cbd4e2;font-size:12px;line-height:1.5;white-space:pre-wrap}.notice.show{display:block}.notice.error{border-color:rgba(255,143,157,.24);color:#ffc1c8;background:#22151c}.key-card{display:none;margin-top:16px;padding:16px;border-radius:14px;border:1px solid rgba(103,217,120,.2);background:rgba(20,42,27,.42)}.key-card.show{display:block}.key-label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#8a9a9a}.key{margin-top:8px;padding:13px;border-radius:10px;background:#09100d;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:17px;word-break:break-all;color:#d8ffe0}.foot{margin-top:13px;text-align:center;color:#66738a;font-size:10px;line-height:1.5}
@media (max-width:560px){.page{padding:12px 10px 24px}.nav{height:60px;border-radius:16px;margin-bottom:14px;padding:0 14px}.hero{padding:20px 16px}.title{font-size:22px}.table-head{display:none}.table{border-radius:16px}.checkpoint{grid-template-columns:1fr auto;padding:13px}.checkpoint > div:nth-child(2),.checkpoint > div:nth-child(3){display:none}.action-slot{justify-self:end}.info{grid-template-columns:1fr 1fr}.primary{margin-top:20px}.ghost{padding:8px 9px}}
</style>
</head>
<body>
<div class="page">
  <div class="nav">
    <div class="brand"><div class="brand-mark">F</div><div class="brand-text">FREZEN</div></div>
    <div class="menu" aria-hidden="true"><span></span><span></span><span></span></div>
  </div>
  <section class="hero">
    <div class="eyebrow">Custom Get-Key</div>
    <h1 id="title" class="title">${escapeHtml(fallbackTitle)}</h1>
    <p id="description" class="description">Complete every checkpoint in order to receive your Frezen key.</p>
    <div class="progress-row"><div class="progress-label">Progress: <span id="progressText">0/0</span></div><div id="statusTop" class="pill pending">READY</div></div>
    <div class="progress-track"><div id="progressFill" class="progress-fill"></div></div>
    <button id="primary" class="primary" type="button"><span id="primaryIcon">↗</span><span id="primaryText">START</span></button>
    <div class="info">
      <div class="info-card"><div class="info-label">Time Left</div><div id="timeLeft" class="info-value">—</div></div>
      <div class="info-card"><div class="info-label">Current</div><div id="currentName" class="info-value">Waiting to start</div></div>
    </div>
    <div id="notice" class="notice"></div>
    <div id="keyCard" class="key-card"><div class="key-label">Your Frezen Key</div><div id="keyValue" class="key"></div></div>
  </section>

  <section class="table">
    <div class="table-head"><div>Checkpoint</div><div>Step</div><div>Status</div><div>Action</div></div>
    <div id="checkpointList"></div>
  </section>
  <div class="foot">This page uses the existing Frezen checkpoint/session system and official SafeLinkU verification. No checkpoint is marked complete by the UI itself.</div>
</div>
<script>
const slug = ${slugJson};
const storageKey = 'frezen:getkey:flow:' + slug;
const els = {
  title: document.getElementById('title'),
  description: document.getElementById('description'),
  progressText: document.getElementById('progressText'),
  progressFill: document.getElementById('progressFill'),
  statusTop: document.getElementById('statusTop'),
  primary: document.getElementById('primary'),
  primaryText: document.getElementById('primaryText'),
  primaryIcon: document.getElementById('primaryIcon'),
  timeLeft: document.getElementById('timeLeft'),
  currentName: document.getElementById('currentName'),
  notice: document.getElementById('notice'),
  checkpointList: document.getElementById('checkpointList'),
  keyCard: document.getElementById('keyCard'),
  keyValue: document.getElementById('keyValue'),
};
let flowId = new URLSearchParams(location.search).get('flow') || localStorage.getItem(storageKey) || null;
let latestState = null;
let timer = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show = (message, error = false) => { els.notice.textContent = message; els.notice.className = 'notice show' + (error ? ' error' : ''); };
const hideNotice = () => { els.notice.className = 'notice'; els.notice.textContent = ''; };
const setTop = (text, kind) => { els.statusTop.textContent = text; els.statusTop.className = 'pill ' + kind; };
const saveFlow = (id) => { if (id) { flowId = id; localStorage.setItem(storageKey, id); const url = new URL(location.href); url.searchParams.set('flow', id); history.replaceState(null, '', url); } };

async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || ('Request failed (' + response.status + ')'));
  return data;
}

function formatTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'Expired';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm ' + String(s).padStart(2, '0') + 's';
}

function renderCountdown(expiresAt) {
  if (timer) clearInterval(timer);
  const tick = () => { els.timeLeft.textContent = formatTime(new Date(expiresAt || 0).getTime() - Date.now()); };
  tick();
  timer = setInterval(tick, 1000);
}

function renderCheckpoints(data) {
  const items = data.checkpoints || [];
  els.checkpointList.innerHTML = items.map((item) => {
    const status = item.status === 'COMPLETED' ? 'done' : item.checkpoint_id === data.state?.next_checkpoint_id ? 'current' : 'pending';
    const label = item.status === 'COMPLETED' ? 'COMPLETED' : status === 'current' ? 'CURRENT' : 'WAITING';
    const disabled = status !== 'current';
    return '<div class="checkpoint">'
      + '<div class="checkpoint-name"><strong>' + esc(item.name) + '</strong><span>' + esc(item.type || 'checkpoint') + '</span></div>'
      + '<div>' + esc(String(item.step || '—')) + '</div>'
      + '<div><span class="pill ' + status + '">' + label + '</span></div>'
      + '<div class="action-slot"><button class="ghost" type="button" data-launch="' + (disabled ? '' : esc(data.next_checkpoint?.launch_path || '')) + '" ' + (disabled ? 'disabled' : '') + '>' + (status === 'current' ? 'OPEN' : '—') + '</button></div>'
      + '</div>';
  }).join('');
  els.checkpointList.querySelectorAll('[data-launch]').forEach((button) => {
    button.addEventListener('click', () => launchCurrentCheckpoint(button.dataset.launch));
  });
}

function render(data) {
  latestState = data;
  const state = data.state || {};
  const items = data.checkpoints || [];
  const total = Number(state.total || items.length || 0);
  const passed = Number(state.passed_count || 0);
  const percent = total ? Math.max(0, Math.min(100, Math.round((passed / total) * 100))) : 0;
  els.progressText.textContent = passed + '/' + total;
  els.progressFill.style.width = percent + '%';
  if (data.service?.name) els.title.textContent = data.service.name;
  if (data.service?.description) els.description.textContent = data.service.description;
  renderCheckpoints(data);

  if (state.status === 'COMPLETED') {
    setTop('COMPLETED', 'done');
    els.currentName.textContent = 'All checkpoints complete';
    els.primary.style.display = 'none';
    show('All checkpoints completed. Your key is available below.');
    loadKey();
  } else if (data.next_checkpoint) {
    setTop('IN PROGRESS', 'current');
    els.currentName.textContent = data.next_checkpoint.name || data.next_checkpoint.checkpoint_id;
    els.primary.style.display = 'flex';
    els.primary.className = 'primary secondary';
    els.primaryText.textContent = 'CONTINUE';
    els.primaryIcon.textContent = '↗';
    renderCountdown(state.expires_at);
    if (new URLSearchParams(location.search).get('verified') === '1') show('Checkpoint verified. Continue with the next checkpoint.');
  } else {
    setTop('READY', 'pending');
    els.primary.style.display = 'flex';
    els.primary.className = 'primary';
    els.primaryText.textContent = 'START';
    els.primaryIcon.textContent = '↗';
    els.currentName.textContent = 'Waiting to start';
  }
}

async function loadService() {
  try {
    const data = await request('/api/v1/get-key/service?slug=' + encodeURIComponent(slug));
    if (data.service?.name) els.title.textContent = data.service.name;
    if (data.service?.description) els.description.textContent = data.service.description;
    const total = Number(data.checkpoint_count || 0);
    els.progressText.textContent = '0/' + total;
    els.progressFill.style.width = '0%';
    els.checkpointList.innerHTML = (data.checkpoints || []).map((item) => '<div class="checkpoint"><div class="checkpoint-name"><strong>' + esc(item.name) + '</strong><span>' + esc(item.type || 'checkpoint') + '</span></div><div>' + esc(String(item.step || '—')) + '</div><div><span class="pill pending">WAITING</span></div><div class="action-slot"><button class="ghost" type="button" disabled>—</button></div></div>').join('');
  } catch (error) {
    show(error.message, true);
  }
}

async function startFlow() {
  els.primary.disabled = true;
  hideNotice();
  try {
    const data = await request('/api/v1/get-key/flow/start?slug=' + encodeURIComponent(slug), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug }) });
    saveFlow(data.flow_id);
    const launch = await request('/api/v1/get-key/flow/' + encodeURIComponent(flowId) + '/launch?json=1');
    if (!launch.url) throw new Error('Checkpoint URL was not returned.');
    location.href = launch.url;
  } catch (error) {
    show(error.message, true);
    els.primary.disabled = false;
  }
}

async function refreshState() {
  if (!flowId) return;
  try {
    const data = await request('/api/v1/get-key/flow/' + encodeURIComponent(flowId));
    render(data);
  } catch (error) {
    localStorage.removeItem(storageKey);
    flowId = null;
    setTop('READY', 'pending');
    els.primary.style.display = 'flex';
    els.primary.disabled = false;
    els.primary.className = 'primary';
    els.primaryText.textContent = 'START';
    els.currentName.textContent = 'Waiting to start';
    show(error.message, true);
  }
}

async function launchCurrentCheckpoint(path) {
  if (!path) return;
  els.primary.disabled = true;
  try {
    const launch = await request(path + (path.includes('?') ? '&' : '?') + 'json=1');
    if (!launch.url) throw new Error('Checkpoint URL was not returned.');
    location.href = launch.url;
  } catch (error) {
    show(error.message, true);
    els.primary.disabled = false;
  }
}

async function loadKey() {
  if (!flowId) return;
  try {
    const data = await request('/api/v1/get-key/key/' + encodeURIComponent(flowId));
    if (data.key) { els.keyValue.textContent = data.key; els.keyCard.className = 'key-card show'; }
    else if (data.error) show(data.error, true);
  } catch (error) {
    show(error.message, true);
  }
}

els.primary.addEventListener('click', async () => {
  if (flowId && latestState?.next_checkpoint?.launch_path) return launchCurrentCheckpoint(latestState.next_checkpoint.launch_path);
  return startFlow();
});

(async () => {
  if (flowId) await refreshState();
  else await loadService();
})();
</script>
</body>
</html>`;
}

export function renderSlugGetKeyPage(slug) {
  return new Response(pageHtml(slug), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE } });
}
