const sections = [
  ['overview','Overview','◈','Control center'],
  ['licenses','Licenses','◇','License lifecycle'],
  ['keys','Keys','⌁','Key management'],
  ['products','Products','▣','Product catalog'],
  ['scripts','Scripts','{}','Script delivery'],
  ['users','Users','♙','User accounts'],
  ['hwid','HWID','⌘','Device binding'],
  ['safelinku','SafeLinkU','↗','Claim integration'],
  ['discord','Discord','◉','Community integration'],
  ['analytics','Analytics','⌁','Usage insights'],
  ['audit','Audit Logs','≡','Activity history'],
  ['invites','Invites','✦','Private invitations'],
  ['security','Security','◆','Security center'],
  ['settings','Settings','⚙','System settings'],
];

const app = document.querySelector('#app');
const esc = (v) => String(v ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const number = (v) => typeof v === 'number' ? v.toLocaleString() : String(v ?? '—');

app.innerHTML = `
<div class="shell">
  <aside class="sidebar" id="sidebar" aria-label="Frezen navigation">
    <div class="brand"><span class="mark">F</span><span>FREZEN</span></div>
    <div class="nav" id="nav"></div>
    <div class="side-foot"><span class="dot"></span>System protected</div>
  </aside>
  <div class="overlay" id="overlay"></div>
  <main class="main">
    <header class="top">
      <div class="top-left">
        <button class="menu" id="menu" aria-label="Open navigation">☰</button>
        <div><p class="eyebrow">CONTROL SYSTEM V3</p><h1 id="title">Overview</h1></div>
      </div>
      <div class="top-right"><span id="user-name" class="eyebrow">Owner</span><div id="avatar" class="avatar">O</div></div>
    </header>
    <section class="content" id="content"></section>
  </main>
</div>`;

const nav = document.querySelector('#nav');
const content = document.querySelector('#content');
const title = document.querySelector('#title');
const sidebar = document.querySelector('#sidebar');
const overlay = document.querySelector('#overlay');

nav.innerHTML = sections.map(([id, label, glyph]) => `<button class="nav-item ${id === 'overview' ? 'active' : ''}" data-section="${id}" title="${esc(label)}"><i>${glyph}</i><span>${esc(label)}</span></button>`).join('');

const stat = (label, value, note, glyph = '') => `<article class="stat"><div class="stat-icon">${glyph}</div><p>${esc(label)}</p><strong>${esc(number(value))}</strong><small>${esc(note)}</small></article>`;
const service = (label, value, ok = true) => `<div class="service"><span><i class="dot"></i>${esc(label)}</span><b class="${ok ? '' : 'warn'}">${esc(value)}</b></div>`;
const feature = ([id, label, glyph, description]) => `<button class="feature" data-section="${id}"><span class="feature-icon">${glyph}</span><span><b>${esc(label)}</b><small>${esc(description)}</small></span><em>›</em></button>`;

function loading(message = 'Loading Frezen data…') {
  content.innerHTML = `<section class="panel loading"><div class="spinner"></div><b>${esc(message)}</b><span>Reading authenticated production data.</span></section>`;
}

function renderOverview(data = {}) {
  const s = data?.stats || data?.metrics || {};
  const values = {
    total: Number(s.total_licenses ?? 0), active: Number(s.active_licenses ?? 0), expired: Number(s.expired_licenses ?? 0), revoked: Number(s.revoked_licenses ?? 0), users: Number(s.users ?? 0), requests: Number(s.script_requests ?? 0), claims: Number(s.safelinku_claims ?? 0), resets: Number(s.hwid_resets ?? 0),
  };
  const activity = Array.isArray(data?.recent_activity) ? data.recent_activity : [];
  const max = Math.max(1, ...Object.values(values));
  content.innerHTML = `<div class="hero"><div><p class="eyebrow">PRIVATE ADMIN AREA</p><h2>Frezen Control Center</h2><p>One secure workspace for licenses, products, scripts, users, devices and integrations.</p></div><span class="badge"><span class="dot"></span>Protected</span></div><div class="stats">${stat('Total Licenses', values.total, 'All license records', '◇')}${stat('Active Licenses', values.active, 'Currently valid', '✓')}${stat('Expired Licenses', values.expired, 'Past expiration', '◷')}${stat('Revoked Licenses', values.revoked, 'Revoked or disabled', '⊘')}${stat('Users', values.users, 'Registered accounts', '♙')}${stat('Script Requests', values.requests, 'Authorized requests', '{}')}${stat('SafeLinkU Claims', values.claims, 'Successful claims', '↗')}${stat('HWID Resets', values.resets, 'Reset operations', '⌘')}</div><div class="columns"><section class="panel"><div class="panel-head"><div><p class="eyebrow">ACTIVITY</p><h3>License activity</h3></div></div><div class="chart">${Object.values(values).map((v) => `<i style="height:${Math.max(8, Math.round(v / max * 100))}%"></i>`).join('')}</div><p class="chart-note">Live trend data is rendered only from the authenticated overview API.</p></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">SYSTEM</p><h3>Service status</h3></div></div>${service('Authentication','Protected')}${service('Authorization','Server enforced')}${service('Database',data?.database || 'Connected')}${service('Environment',data?.environment || 'production')}</section></div><section class="panel quick-panel"><div class="panel-head"><div><p class="eyebrow">CONTROL CENTER</p><h3>Manage Frezen</h3></div></div><div class="feature-grid">${sections.slice(1).map(feature).join('')}</div></section><section class="panel recent-panel"><div class="panel-head"><div><p class="eyebrow">AUDIT</p><h3>Recent activity</h3></div><button class="ghost" data-section="audit">View logs</button></div>${activity.length ? activity.slice(0,8).map((a) => `<div class="activity"><span>${esc(a.action || a.event || 'Activity')}<small>${esc(a.resource || a.user || 'Frezen')}</small></span><small>${esc(a.created_at || a.timestamp || '')}</small></div>`).join('') : `<div class="empty"><b>No recent activity</b><span>Activity will appear here when events are recorded.</span></div>`}</section>`;
}

function renderSection(id) {
  if (id === 'overview') return loadOverview();
  if (id === 'hwid') { if (window.FrezenDashboardPanels?.hwid) return window.FrezenDashboardPanels.hwid(); content.innerHTML = `<section class="panel loading"><b>HWID panel is still loading…</b><span>Please try again.</span></section>`; return; }
  if (id === 'scripts') { if (window.FrezenDashboardPanels?.scripts) return window.FrezenDashboardPanels.scripts(); content.innerHTML = `<section class="panel loading"><b>Scripts panel is still loading…</b><span>Please try again.</span></section>`; return; }
  if (id === 'safelinku') { if (window.FrezenDashboardPanels?.safelinku) return window.FrezenDashboardPanels.safelinku(); content.innerHTML = `<section class="panel loading"><b>SafeLinkU panel is still loading…</b><span>Please try again.</span></section>`; return; }
  if (id === 'discord') { if (window.FrezenDashboardPanels?.discord) return window.FrezenDashboardPanels.discord(); content.innerHTML = `<section class="panel loading"><b>Discord panel is still loading…</b><span>Please try again.</span></section>`; return; }
  if (id === 'analytics') { if (window.FrezenDashboardPanels?.analytics) return window.FrezenDashboardPanels.analytics(); content.innerHTML = `<section class="panel loading"><b>Analytics panel is still loading…</b><span>Please try again.</span></section>`; return; }

  const item = sections.find((s) => s[0] === id);
  const implementation = {
    licenses: ['License Management','Search, status filters, pagination, detail metadata and safe lifecycle actions are the next connected license surface.'],
    keys: ['Key Management','Secure license/key operations will use the existing server-side authorization boundary.'],
    products: ['Products','Create, edit, disable and safely delete unused products through the authenticated product API.'],
    users: ['Users','Manage authenticated accounts, roles and status without trusting client-side permissions.'],
    audit: ['Audit Logs','Immutable-style activity history and security-relevant actions will be surfaced here.'],
    invites: ['Invites','Private invitation management for controlled team access.'],
    security: ['Security Center','Authentication events, rate limits and suspicious activity will be surfaced here.'],
    settings: ['Settings','Protected system settings and integration configuration.'],
  };
  const [heading, description] = implementation[id] || [item?.[1] || id, 'Frezen Control System feature surface.'];
  content.innerHTML = `<section class="panel section-page"><div class="section-heading"><div><p class="eyebrow">${esc((item?.[1] || id).toUpperCase())}</p><h2>${esc(heading)}</h2><p>${esc(description)}</p></div><span class="badge"><span class="dot"></span>Protected</span></div><div class="feature-grid single-page">${sections.filter((s) => s[0] !== id).slice(0,3).map(feature).join('')}</div></section>`;
}

async function loadOverview() {
  loading();
  try {
    const response = await fetch('/api/v1/dashboard/overview?range=24h', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (response.status === 401 || response.status === 403) { location.href = '/login'; return; }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const user = data.user || data.current_user;
    if (user) { const display = user.username || user.email || 'Owner'; document.querySelector('#user-name').textContent = display; document.querySelector('#avatar').textContent = display.slice(0,1).toUpperCase(); }
    renderOverview(data);
  } catch (error) {
    content.innerHTML = `<section class="hero error"><div><p class="eyebrow">DASHBOARD ERROR</p><h2>Unable to load live data</h2><p>The authenticated dashboard API returned an error: ${esc(error.message)}</p></div><button class="primary" id="retry">Retry</button></section>`;
    document.querySelector('#retry').onclick = loadOverview;
  }
}

function select(id) { document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.section === id)); title.textContent = sections.find((s) => s[0] === id)?.[1] || id; renderSection(id); sidebar.classList.remove('open'); overlay.classList.remove('show'); }
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => select(button.dataset.section)));
document.addEventListener('click', (event) => { const button = event.target.closest('[data-section]'); if (button) select(button.dataset.section); });
document.querySelector('#menu').onclick = () => { sidebar.classList.add('open'); overlay.classList.add('show'); };
overlay.onclick = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };
loadOverview();
