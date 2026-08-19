const root = document.querySelector('#content');
const escapeHtml = (value) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

let devices = [];
let query = '';
let filter = 'all';

async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { accept: 'application/json', ...(options.headers || {}) } });
  if (response.status === 401 || response.status === 403) { window.location.href = '/login'; throw new Error('SESSION_EXPIRED'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
  return data;
}

function shell() {
  root.innerHTML = `
    <section class="hwid-page">
      <div class="hwid-header">
        <div class="hwid-title-row"><div class="hwid-icon">♢</div><div><p class="eyebrow">DEVICE SECURITY</p><h2>HWID blacklist</h2><p>Hardware IDs are recorded automatically when a valid key is used.</p></div></div>
        <button class="hwid-refresh" id="hwid-refresh">↻ Refresh</button>
      </div>
      <section class="hwid-summary"><div><span>Recorded</span><strong id="hwid-total">0</strong><small>devices seen from valid keys</small></div><div><span>Active</span><strong id="hwid-active">0</strong><small>currently allowed</small></div><div><span>Blocked</span><strong id="hwid-blocked">0</strong><small>blacklisted devices</small></div></section>
      <section class="hwid-card">
        <div class="hwid-toolbar"><div class="hwid-tabs"><button class="hwid-tab active" data-filter="all">All</button><button class="hwid-tab" data-filter="active">Active</button><button class="hwid-tab" data-filter="blocked">Blocked</button></div><div class="hwid-search"><span>⌕</span><input id="hwid-search" placeholder="Search HWID or key…" autocomplete="off"></div></div>
        <div id="hwid-list" class="hwid-list"></div>
        <div id="hwid-empty" class="hwid-empty" hidden><div class="hwid-empty-icon">♢</div><b>No recorded HWIDs</b><span>When a valid key is used, its HWID will appear here automatically.</span></div>
      </section>
    </section>`;

  root.querySelectorAll('.hwid-tab').forEach((button) => button.addEventListener('click', () => { filter = button.dataset.filter; root.querySelectorAll('.hwid-tab').forEach((tab) => tab.classList.toggle('active', tab === button)); renderDevices(); }));
  root.querySelector('#hwid-search').addEventListener('input', (event) => { query = event.target.value.trim().toLowerCase(); renderDevices(); });
  root.querySelector('#hwid-refresh').addEventListener('click', loadDevices);
}

function renderStats() {
  const active = devices.filter((d) => String(d.status).toLowerCase() === 'active').length;
  const blocked = devices.filter((d) => String(d.status).toLowerCase() === 'blocked').length;
  root.querySelector('#hwid-total').textContent = devices.length;
  root.querySelector('#hwid-active').textContent = active;
  root.querySelector('#hwid-blocked').textContent = blocked;
}

function renderDevices() {
  const list = root.querySelector('#hwid-list');
  const empty = root.querySelector('#hwid-empty');
  const visible = devices.filter((device) => {
    const status = String(device.status || '').toLowerCase();
    if (filter !== 'all' && status !== filter) return false;
    if (!query) return true;
    return `${device.fingerprint || ''} ${device.id || ''} ${device.key_name || ''} ${device.service_name || ''} ${device.license_id || ''}`.toLowerCase().includes(query);
  });
  empty.hidden = devices.length !== 0;
  list.hidden = devices.length === 0;
  if (!visible.length && devices.length) { list.innerHTML = '<div class="hwid-no-match">No HWID matches the current filter.</div>'; return; }
  list.innerHTML = visible.map((device) => {
    const status = String(device.status || 'unknown').toLowerCase();
    const action = status === 'blocked' ? 'Unblock' : 'Block';
    const label = device.fingerprint ? `HWID-${String(device.fingerprint).toUpperCase()}` : `Device-${String(device.id).slice(0, 12)}`;
    return `<article class="hwid-row ${status}">
      <div class="hwid-row-main"><div class="hwid-device-icon">⌁</div><div><b>${escapeHtml(label)}</b><span>Device ID: ${escapeHtml(device.id)}</span><small>Key: ${escapeHtml(device.key_name || device.license_id || 'Unknown')}</small></div></div>
      <div class="hwid-row-meta"><span class="hwid-status ${escapeHtml(status)}">${escapeHtml(status)}</span><span>First seen ${escapeHtml(device.first_seen)}</span><span>Last seen ${escapeHtml(device.last_seen)}</span></div>
      <div class="hwid-row-actions"><button class="hwid-action ${status === 'blocked' ? 'unblock' : 'block'}" data-action="${action.toLowerCase()}" data-id="${escapeHtml(device.id)}">${action}</button><button class="hwid-action reset" data-action="reset" data-license="${escapeHtml(device.license_id)}">Reset</button></div>
    </article>`;
  }).join('');
  list.querySelectorAll('.hwid-action').forEach((button) => button.addEventListener('click', () => performAction(button.dataset.action, button.dataset.id, button.dataset.license)));
}

async function loadDevices() {
  shell();
  root.querySelector('#hwid-list').innerHTML = '<div class="hwid-loading"><div class="spinner"></div><b>Loading HWIDs…</b><span>Reading the V2 device binding table.</span></div>';
  try {
    const data = await request('/api/v1/hwid');
    devices = Array.isArray(data.devices) ? data.devices : [];
    renderStats();
    renderDevices();
  } catch (error) {
    root.querySelector('#hwid-list').innerHTML = `<div class="hwid-error"><b>Unable to load HWID data</b><span>${escapeHtml(error.message)}</span></div>`;
  }
}

async function performAction(action, deviceId, licenseId) {
  if (action === 'reset') {
    if (!licenseId) return window.alert('This device has no linked license.');
    if (!window.confirm('Reset HWID for this license? Existing active HWID bindings will be blocked.')) return;
    try { await request(`/api/v1/licenses/${encodeURIComponent(licenseId)}/hwid/reset`, { method:'POST', headers:{'content-type':'application/json'}, body:'{}' }); await loadDevices(); }
    catch (error) { window.alert(`HWID reset failed: ${error.message}`); }
    return;
  }
  if (!deviceId) return;
  if (!window.confirm(`${action === 'block' ? 'Block' : 'Unblock'} this HWID?`)) return;
  try { await request(`/api/v1/hwid/devices/${encodeURIComponent(deviceId)}/${action === 'block' ? 'block' : 'unblock'}`, { method:'PATCH', headers:{'content-type':'application/json'}, body:'{}' }); await loadDevices(); }
  catch (error) { window.alert(`HWID action failed: ${error.message}`); }
}

function mount() { if (!root) return; loadDevices(); }
window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.hwid = mount;
