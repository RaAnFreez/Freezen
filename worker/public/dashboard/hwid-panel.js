const root = document.querySelector('#content');
const escapeHtml = (value) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

let devices = [];
let filter = 'all';
let query = '';

async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { accept: 'application/json', ...(options.headers || {}) } });
  if (response.status === 401) { location.href = '/login'; throw new Error('SESSION_EXPIRED'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function shell() {
  root.innerHTML = `
    <section class="hwid-page">
      <div class="hwid-head"><div class="hwid-heading"><div class="hwid-shield">⌘</div><div><p class="eyebrow">DEVICE SECURITY</p><h2>HWID blacklist</h2><p>HWIDs are recorded automatically when a valid key is used.</p></div></div><button class="hwid-ban" id="hwid-ban">＋ Ban</button></div>
      <div class="hwid-stats" id="hwid-stats"></div>
      <section class="hwid-card">
        <div class="hwid-toolbar"><div class="hwid-tabs"><button class="hwid-tab active" data-filter="all">All</button><button class="hwid-tab" data-filter="active">Active</button><button class="hwid-tab" data-filter="blocked">Blocked</button></div><div class="hwid-search"><span>⌕</span><input id="hwid-search" placeholder="Search HWID or key…" autocomplete="off"><button id="hwid-refresh" title="Refresh">↻</button></div></div>
        <div id="hwid-list"></div>
        <div id="hwid-empty" class="hwid-empty" hidden><div class="hwid-empty-icon">⌁</div><b>No HWIDs recorded yet</b><span>Use a valid key through the loader to record a device.</span></div>
      </section>
    </section>`;
  root.querySelectorAll('.hwid-tab').forEach((button) => button.onclick = () => { filter = button.dataset.filter; root.querySelectorAll('.hwid-tab').forEach((tab) => tab.classList.toggle('active', tab === button)); render(); });
  root.querySelector('#hwid-search').oninput = (event) => { query = event.target.value.trim().toLowerCase(); render(); };
  root.querySelector('#hwid-refresh').onclick = load;
  root.querySelector('#hwid-ban').onclick = () => window.alert('Select Block on a recorded HWID.');
}

function renderStats() {
  const active = devices.filter((d) => String(d.status).toLowerCase() === 'active').length;
  const blocked = devices.filter((d) => String(d.status).toLowerCase() === 'blocked').length;
  root.querySelector('#hwid-stats').innerHTML = `<div><span>Recorded</span><strong>${devices.length}</strong><small>devices seen</small></div><div><span>Active</span><strong>${active}</strong><small>allowed devices</small></div><div><span>Blocked</span><strong>${blocked}</strong><small>blacklisted devices</small></div>`;
}

function render() {
  renderStats();
  const list = root.querySelector('#hwid-list');
  const empty = root.querySelector('#hwid-empty');
  const items = devices.filter((device) => {
    const status = String(device.status || '').toLowerCase();
    if (filter !== 'all' && status !== filter) return false;
    if (!query) return true;
    return `${device.fingerprint || ''} ${device.id || ''} ${device.license_id || ''} ${device.key_name || ''} ${device.service_name || ''}`.toLowerCase().includes(query);
  });
  empty.hidden = devices.length !== 0;
  if (!items.length && devices.length) { list.innerHTML = '<div class="hwid-no-match">No HWID matches the current filter.</div>'; return; }
  list.innerHTML = items.map((device) => {
    const status = String(device.status || 'unknown').toLowerCase();
    const action = status === 'blocked' ? 'Unblock' : 'Block';
    return `<article class="hwid-row"><div class="hwid-main"><div class="hwid-device-icon">⌁</div><div><b>HWID-${escapeHtml(device.fingerprint || String(device.id || '').replace(/-/g, '').slice(0,12).toUpperCase())}</b><small>${escapeHtml(device.key_name || device.license_id || 'Key')} · ${escapeHtml(device.service_name || 'Service')}</small><small>Last seen: ${escapeHtml(device.last_seen || '—')}</small></div></div><div><span class="hwid-status ${escapeHtml(status)}">${escapeHtml(status)}</span></div><div class="hwid-actions"><button class="hwid-action ${status === 'blocked' ? 'unblock' : 'block'}" data-action="${action.toLowerCase()}" data-id="${escapeHtml(device.id)}">${action}</button><button class="hwid-action reset" data-action="reset" data-license="${escapeHtml(device.license_id)}">Reset</button></div></article>`;
  }).join('');
  list.querySelectorAll('.hwid-action').forEach((button) => button.onclick = () => performAction(button.dataset.action, button.dataset.id, button.dataset.license));
}

async function load() {
  shell();
  const list = root.querySelector('#hwid-list');
  list.innerHTML = '<div class="hwid-loading"><div class="spinner"></div><b>Loading HWIDs…</b></div>';
  try {
    const data = await request('/api/v1/hwid');
    devices = Array.isArray(data.devices) ? data.devices : [];
    render();
  } catch (error) {
    list.innerHTML = `<div class="hwid-error"><b>Unable to load HWID data</b><span>${escapeHtml(error.message)}</span></div>`;
  }
}

async function performAction(action, deviceId, licenseId) {
  if (action === 'reset') {
    if (!licenseId || !confirm('Reset HWID bindings for this license?')) return;
    try { await request(`/api/v1/hwid/licenses/${encodeURIComponent(licenseId)}/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); await load(); } catch (error) { alert(`Reset failed: ${error.message}`); }
    return;
  }
  if (!deviceId || !confirm(`${action === 'block' ? 'Block' : 'Unblock'} this HWID?`)) return;
  try { await request(`/api/v1/hwid/devices/${encodeURIComponent(deviceId)}/${action}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' }); await load(); } catch (error) { alert(`Action failed: ${error.message}`); }
}

window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.hwid = load;
