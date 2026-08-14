const root = document.querySelector('#content');
const escapeHtml = (value) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

let licenses = [];
let selectedLicense = '';
let devices = [];

async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { accept: 'application/json', ...(options.headers || {}) } });
  if (response.status === 401 || response.status === 403) {
    window.location.href = '/login';
    throw new Error('SESSION_EXPIRED');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function shell() {
  root.innerHTML = `
    <section class="hero">
      <div><p class="eyebrow">DEVICE CONTROL</p><h2>HWID Management</h2><p>Inspect license-bound devices and perform protected reset or block actions.</p></div>
      <span class="badge"><span class="dot"></span>Protected</span>
    </section>
    <section class="hwid-toolbar panel">
      <div class="hwid-toolbar-title"><p class="eyebrow">LICENSE SCOPE</p><h3>Select a license</h3></div>
      <div class="hwid-controls">
        <select id="hwid-license" aria-label="Select license"><option value="">Loading licenses…</option></select>
        <button class="primary" id="hwid-refresh">Refresh</button>
      </div>
    </section>
    <div class="stats" id="hwid-stats"></div>
    <section class="panel">
      <div class="panel-head"><div><p class="eyebrow">BOUND DEVICES</p><h3>Devices</h3></div><span id="hwid-count" class="eyebrow"></span></div>
      <div class="table-wrap"><table class="hwid-table"><thead><tr><th>Device</th><th>Status</th><th>First seen</th><th>Last seen</th><th>Blocked</th><th>Actions</th></tr></thead><tbody id="hwid-body"></tbody></table></div>
      <div id="hwid-empty" class="empty" hidden><b>No devices bound</b><span>This license has no recorded HWID devices.</span></div>
    </section>`;
  document.querySelector('#hwid-license').addEventListener('change', (event) => { selectedLicense = event.target.value; loadDevices(); });
  document.querySelector('#hwid-refresh').addEventListener('click', loadDevices);
}

function statusBadge(status) {
  const safe = String(status || 'unknown').toLowerCase();
  return `<span class="status-pill ${escapeHtml(safe)}">${escapeHtml(safe)}</span>`;
}

function renderStats() {
  const active = devices.filter((d) => d.status === 'active').length;
  const blocked = devices.filter((d) => d.status === 'blocked').length;
  const lastSeen = devices.reduce((latest, d) => Math.max(latest, Date.parse(d.last_seen || '') || 0), 0);
  document.querySelector('#hwid-stats').innerHTML = [
    ['Devices', devices.length, 'Bound to selected license', '⌘'],
    ['Active', active, 'Allowed devices', '✓'],
    ['Blocked', blocked, 'Blocked devices', '⊘'],
    ['Last activity', lastSeen ? new Date(lastSeen).toLocaleString() : '—', 'Most recent last_seen', '◷'],
  ].map(([label, value, note, glyph]) => `<article class="stat"><div class="stat-icon">${glyph}</div><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`).join('');
  document.querySelector('#hwid-count').textContent = `${devices.length} device${devices.length === 1 ? '' : 's'}`;
}

function renderDevices() {
  const body = document.querySelector('#hwid-body');
  const empty = document.querySelector('#hwid-empty');
  empty.hidden = devices.length !== 0;
  body.innerHTML = devices.map((device) => {
    const action = device.status === 'blocked' ? 'Unblock' : 'Block';
    return `<tr>
      <td><b>${escapeHtml(device.id)}</b><small>HWID is stored server-side as a hash</small></td>
      <td>${statusBadge(device.status)}</td>
      <td>${escapeHtml(device.first_seen)}</td>
      <td>${escapeHtml(device.last_seen)}</td>
      <td>${escapeHtml(device.blocked_at || '—')}<small>${escapeHtml(device.blocked_reason || '')}</small></td>
      <td><div class="row-actions"><button class="ghost device-action" data-action="${action.toLowerCase()}" data-id="${escapeHtml(device.id)}">${action}</button><button class="ghost device-action" data-action="reset" data-id="${escapeHtml(device.id)}" data-license="${escapeHtml(selectedLicense)}">Reset</button></div></td>
    </tr>`;
  }).join('');
  body.querySelectorAll('.device-action').forEach((button) => button.addEventListener('click', () => performAction(button.dataset.action, button.dataset.id, button.dataset.license || selectedLicense)));
}

async function loadLicenses() {
  try {
    const data = await request('/api/v1/licenses?page=1&page_size=50');
    licenses = Array.isArray(data.licenses) ? data.licenses : [];
    const select = document.querySelector('#hwid-license');
    select.innerHTML = `<option value="">Choose a license…</option>` + licenses.map((license) => `<option value="${escapeHtml(license.id)}">${escapeHtml(license.id)} — ${escapeHtml(license.username || license.email || 'unassigned')} — ${escapeHtml(license.status)}</option>`).join('');
    if (selectedLicense && licenses.some((license) => license.id === selectedLicense)) select.value = selectedLicense;
    if (!selectedLicense && licenses.length) { selectedLicense = licenses[0].id; select.value = selectedLicense; await loadDevices(); }
    if (!licenses.length) { document.querySelector('#hwid-body').innerHTML = ''; document.querySelector('#hwid-empty').hidden = false; document.querySelector('#hwid-empty').innerHTML = '<b>No licenses found</b><span>Create a license first in License Management.</span>'; }
  } catch (error) {
    document.querySelector('#hwid-body').innerHTML = `<tr><td colspan="6"><div class="empty"><b>Unable to load licenses</b><span>${escapeHtml(error.message)}</span></div></td></tr>`;
  }
}

async function loadDevices() {
  if (!selectedLicense) return;
  document.querySelector('#hwid-body').innerHTML = '<tr><td colspan="6"><div class="empty"><div class="spinner"></div><b>Loading devices…</b></div></td></tr>';
  try {
    const data = await request(`/api/v1/hwid?license_id=${encodeURIComponent(selectedLicense)}`);
    devices = Array.isArray(data.devices) ? data.devices : [];
    renderStats();
    renderDevices();
  } catch (error) {
    document.querySelector('#hwid-body').innerHTML = `<tr><td colspan="6"><div class="empty"><b>Unable to load HWID data</b><span>${escapeHtml(error.message)}</span></div></td></tr>`;
  }
}

async function performAction(action, deviceId, licenseId) {
  if (action === 'reset') {
    if (!window.confirm('Reset HWID for this license? Existing active devices will be blocked and the license will require a new bind.')) return;
    try {
      await request(`/api/v1/licenses/${encodeURIComponent(licenseId)}/hwid/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      await loadDevices();
    } catch (error) { window.alert(`HWID reset failed: ${error.message}`); }
    return;
  }
  const endpoint = `/api/v1/hwid/devices/${encodeURIComponent(deviceId)}/${action === 'block' ? 'block' : 'unblock'}`;
  if (!window.confirm(`${action === 'block' ? 'Block' : 'Unblock'} this device?`)) return;
  try {
    await request(endpoint, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' });
    await loadDevices();
  } catch (error) { window.alert(`Device action failed: ${error.message}`); }
}

function mount() {
  if (!root) return;
  shell();
  loadLicenses();
}

// The dashboard router is the single navigation owner. Export only the panel
// mount function; do not attach navigation listeners or MutationObservers here.
window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.hwid = mount;
