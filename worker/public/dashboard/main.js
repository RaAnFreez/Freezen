const navGroups = [
  {
    label: 'KEY SYSTEM',
    items: [
      ['licenses','Keys','◇','License/key control'],
      ['services','Services','▦','Service configuration'],
      ['safelinku','SafeLinkU','↗','SafeLinkU integration'],
      ['provider','Provider','⌁','Key-link provider configuration'],
    ],
  },
  {
    label: 'SCRIPTS',
    items: [
      ['scripts','Lua Scripts','{}','Script delivery and authorization'],
      ['script-delivery','Script Delivery','↗','Key and embedded loader delivery'],
    ],
  },
  {
    label: 'MODERATION',
    items: [
      ['hwid','HWIDs','⌘','Device binding and control'],
    ],
  },
];

const sections = navGroups.flatMap((group) => group.items);

const app = document.querySelector('#app');
const esc = (v) => String(v ?? '—').replace(/[&<>\"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;' }[c]));

app.innerHTML = `<div class="shell"><aside class="sidebar" id="sidebar" aria-label="Frezen navigation"><div class="brand"><span class="mark">F</span><span>FREZEN</span></div><div class="nav" id="nav"></div><div class="side-bottom"><div class="side-foot"><span class="dot"></span><span>System protected</span></div><div class="side-user"><div id="side-avatar" class="side-avatar">O</div><div class="side-user-copy"><b id="side-user-name">Owner</b><small id="side-user-email">Authenticated account</small></div><span class="side-user-chevron">⌃</span></div></div></aside><div class="overlay" id="overlay"></div><main class="main"><header class="top"><div class="top-left"><button class="menu" id="menu" aria-label="Open navigation">☰</button><div><p class="eyebrow">CONTROL SYSTEM V3</p><h1 id="title">Keys</h1></div></div><div class="top-right"><span id="user-name" class="eyebrow">Owner</span><div id="avatar" class="avatar">O</div></div></header><section class="content" id="content"></section></main></div>`;

const nav = document.querySelector('#nav');
const content = document.querySelector('#content');
const title = document.querySelector('#title');
const sidebar = document.querySelector('#sidebar');
const overlay = document.querySelector('#overlay');

nav.innerHTML = navGroups.map((group) => `<section class="nav-group" aria-label="${esc(group.label)}"><div class="nav-group-label">${esc(group.label)}</div>${group.items.map(([id, label, glyph]) => `<button class="nav-item ${id === 'licenses' ? 'active' : ''}" data-section="${id}" title="${esc(label)}"><i>${glyph}</i><span>${esc(label)}</span></button>`).join('')}</section>`).join('');

function loading(message = 'Loading…') { content.innerHTML = `<section class="panel loading"><div class="spinner"></div><b>${esc(message)}</b><span>Reading authenticated production data.</span></section>`; }

function renderSection(id) {
  const panelName = { licenses: 'licenses', hwid: 'hwid', scripts: 'scripts', 'script-delivery': 'scripts', safelinku: 'safelinku', services: 'services', provider: 'provider' }[id];
  if (panelName && window.FrezenDashboardPanels?.[panelName]) return window.FrezenDashboardPanels[panelName]();
  loading(`${sections.find((s) => s[0] === id)?.[1] || 'Panel'} is still loading…`);
}

async function loadCurrentUser() {
  try {
    const response = await fetch('/api/v1/dashboard/overview?range=24h', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (response.status === 401 || response.status === 403) { location.href = '/login'; return; }
    if (!response.ok) return;
    const data = await response.json();
    const user = data.user || data.current_user;
    if (user) {
      const display = user.username || user.email || 'Owner';
      const email = user.email || 'Authenticated account';
      document.querySelector('#user-name').textContent = display;
      document.querySelector('#avatar').textContent = display.slice(0, 1).toUpperCase();
      document.querySelector('#side-user-name').textContent = display;
      document.querySelector('#side-user-email').textContent = email;
      document.querySelector('#side-avatar').textContent = display.slice(0, 1).toUpperCase();
    }
  } catch (_) {}
}

function select(id) {
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.section === id));
  title.textContent = sections.find((s) => s[0] === id)?.[1] || id;
  renderSection(id);
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
}

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => select(button.dataset.section)));
document.querySelector('#menu').onclick = () => { sidebar.classList.add('open'); overlay.classList.add('show'); };
overlay.onclick = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };

loadCurrentUser();
setTimeout(() => select('licenses'), 0);
