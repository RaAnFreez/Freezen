const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const PROVIDERS_KEY = 'frezen.providers.v1';
const SERVICES_KEY = 'frezen.services.v1';
const SAFE_KEY = 'frezen.safelinku.integration.meta';
const SAFE_CHECKPOINTS_KEY = 'frezen.safelinku.checkpoints.v1';

const readJson = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const makeId = () => crypto.randomUUID();

function migrateLegacyProviders() {
  const services = readJson(SERVICES_KEY, []);
  const current = readJson(PROVIDERS_KEY, []);
  if (current.length) return current;
  const migrated = services.filter((service) => service?.provider).map((service) => ({
    id: service.provider.id || makeId(),
    name: service.provider.name || `${service.name} Provider`,
    service_id: service.id,
    type: service.provider.type || 'safelinku',
    active: service.provider.active !== false,
    key_validity_minutes: 60,
    user_select_mode: false,
    hwid_limit_enabled: true,
    max_hwids_per_key: 1,
    session_limit_enabled: false,
    session_limit: 1,
    checkpoints: [],
    one_time_use: false,
    expiry_on_first_use: false,
    streak_system: false,
    protection: { visitor: false, vpn: false, adblock: false, incognito: false, blocked_countries: [], blocked_browsers: [] },
    requirements: { discord: false, account: false },
    updated_at: new Date().toISOString(),
  }));
  if (migrated.length) writeJson(PROVIDERS_KEY, migrated);
  return migrated;
}

const checkpointRows = () => readJson(SAFE_CHECKPOINTS_KEY, []);
const selectedCheckpointNames = (ids) => checkpointRows().filter((row) => ids.includes(row.id));

function openProviderModal({ edit = false, provider = null }) {
  const services = readJson(SERVICES_KEY, []);
  const safeMeta = readJson(SAFE_KEY, null);
  const checkpoints = checkpointRows();
  const current = provider || {};
  const protection = current.protection || {};
  const requirements = current.requirements || {};
  const wrap = document.createElement('div');
  wrap.className = 'provider-modal-backdrop';
  wrap.innerHTML = `<section class="provider-modal provider-config-modal" role="dialog" aria-modal="true">
    <div class="provider-modal-head"><div><div class="provider-icon">⌁</div><h3>${edit ? 'Edit Provider' : 'Create provider'}</h3><p>${edit ? 'Modify key-system provider settings' : 'Create provider with checkpoints'}</p></div><button class="provider-close" type="button" aria-label="Close">×</button></div>
    <div class="provider-tabs" role="tablist" aria-label="Provider settings">
      ${['General','Checkpoints','Keys','Protection','Requirements'].map((tab) => `<button type="button" class="provider-tab ${tab === 'General' ? 'active' : ''}" data-tab="${tab.toLowerCase()}">${tab}</button>`).join('')}
    </div>
    <form class="provider-form">
      <div class="provider-tab-panel active" data-panel="general">
        <div class="provider-field"><label>Provider name <span class="provider-required">*</span></label><input id="provider-name" maxlength="100" required value="${esc(current.name || '')}" placeholder="Provider name"></div>
        <div class="provider-field"><label>Service <span class="provider-required">*</span></label><select id="provider-service" required><option value="">Select a service</option>${services.map((s) => `<option value="${esc(s.id)}" ${current.service_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>${!services.length ? '<small class="provider-help">Create a Service first, then connect it here.</small>' : ''}</div>
        <div class="provider-field"><label>Provider type</label><select id="provider-type"><option value="safelinku" ${current.type === 'safelinku' || !current.type ? 'selected' : ''}>SafeLinkU</option></select></div>
        <div class="provider-connection ${safeMeta?.key_configured ? 'ready' : 'pending'}"><span class="provider-connection-dot"></span><div><b>SafeLinkU integration</b><small>${safeMeta?.key_configured ? 'Configured and available to this provider.' : 'Pending — configure SafeLinkU in its own tab first.'}</small></div></div>
        <p class="provider-note">The Configured Link belongs to the Service. Provider connects that Service to the selected key-system provider; it does not own a public link.</p>
        <div class="provider-grid-two"><div class="provider-field"><label>Key validity <span class="provider-required">*</span></label><div class="provider-inline"><input id="provider-validity" type="number" min="1" max="10080" value="${Number(current.key_validity_minutes || 60)}"><span>min</span><input id="provider-validity-hours" type="text" readonly value="${(Number(current.key_validity_minutes || 60) / 60).toFixed(2)}"><span>h</span></div></div></div>
        <div class="provider-option"><div><b>User Select Mode</b><small>Users choose from multiple options.</small></div><input id="provider-user-select" type="checkbox" ${current.user_select_mode ? 'checked' : ''}></div>
        <div class="provider-option"><div><b>HWID Limit</b><small>Maximum number of devices that can use this key.</small></div><input id="provider-hwid-toggle" type="checkbox" ${current.hwid_limit_enabled !== false ? 'checked' : ''}></div>
        <div class="provider-field provider-dependent" data-depends="hwid"><label>Max HWIDs per Key</label><input id="provider-hwid-max" type="number" min="1" max="50" value="${Number(current.max_hwids_per_key || 1)}"><small class="provider-help">Default: 1 device per key.</small></div>
        <div class="provider-option"><div><b>Session Limit</b><small>No session limit means concurrent sessions can run unlimited.</small></div><input id="provider-session-toggle" type="checkbox" ${current.session_limit_enabled ? 'checked' : ''}></div>
        <div class="provider-field provider-dependent" data-depends="session"><label>Concurrent session limit</label><input id="provider-session-limit" type="number" min="1" max="100" value="${Number(current.session_limit || 1)}"></div>
      </div>
      <div class="provider-tab-panel" data-panel="checkpoints">
        <div class="provider-section-title"><div><b>Available integrations</b><small>Checkpoints created in the SafeLinkU tab appear here.</small></div></div>
        <input class="provider-search" id="checkpoint-search" placeholder="Search…" aria-label="Search checkpoints">
        <div class="provider-integration-row"><div><b>Getkey system</b><small>SafeLinkU integration${safeMeta?.name ? ` · ${esc(safeMeta.name)}` : ''}</small></div><span class="provider-plus">+</span></div>
        <div class="provider-sequence-head"><div><b>Sequence</b><small>Visitors complete these steps in order.</small></div><span>${current.checkpoints?.length || 0} selected</span></div>
        <div class="provider-checkpoint-list" id="provider-checkpoint-list">${checkpoints.length ? checkpoints.map((checkpoint) => `<label class="provider-checkpoint-row" data-name="${esc(`${checkpoint.name} ${checkpoint.id}`.toLowerCase())}"><input class="provider-checkpoint" type="checkbox" value="${esc(checkpoint.id)}" ${(current.checkpoints || []).includes(checkpoint.id) ? 'checked' : ''}><span><b>${esc(checkpoint.name)}</b><small>${esc(checkpoint.type || 'SafeLinkU checkpoint')} · ${esc(checkpoint.id)}</small></span><strong>+</strong></label>`).join('') : '<div class="provider-no-checkpoints"><div>▦</div><b>No checkpoints yet.</b><span>Create a checkpoint in SafeLinkU, then return here.</span></div>'}</div>
        <p class="provider-warning">A provider can only use real checkpoints created/configured through the SafeLinkU integration. Frezen does not simulate completion or bypass provider verification.</p>
      </div>
      <div class="provider-tab-panel" data-panel="keys">
        <div class="provider-option"><div><b>One-time use keys</b><small>Invalidate a key after successful use.</small></div><input id="provider-one-time" type="checkbox" ${current.one_time_use ? 'checked' : ''}></div>
        <div class="provider-option"><div><b>Expiry on first use</b><small>Start the key validity timer when the key is first used.</small></div><input id="provider-expiry-first" type="checkbox" ${current.expiry_on_first_use ? 'checked' : ''}></div>
        <div class="provider-option"><div><b>Streak System</b><small>Track consecutive successful checkpoint runs.</small></div><input id="provider-streak" type="checkbox" ${current.streak_system ? 'checked' : ''}></div>
      </div>
      <div class="provider-tab-panel" data-panel="protection">
        <div class="provider-option"><div><b>Visitor protection</b><small>Apply your account-wide visitor protection settings.</small></div><input id="protect-visitor" type="checkbox" ${protection.visitor ? 'checked' : ''}></div>
        <div class="provider-option"><div><b>Block VPN / datacenter</b><small>Visitors on VPN, proxy or datacenter IP cannot start this provider.</small></div><input id="protect-vpn" type="checkbox" ${protection.vpn ? 'checked' : ''}></div>
        <div class="provider-option"><div><b>Block ad blockers</b><small>Visitors with an active ad blocker cannot continue.</small></div><input id="protect-adblock" type="checkbox" ${protection.adblock ? 'checked' : ''}></div>
        <div class="provider-option"><div><b>Block incognito mode</b><small>Private browsing can be blocked when enabled.</small></div><input id="protect-incognito" type="checkbox" ${protection.incognito ? 'checked' : ''}></div>
        <div class="provider-field"><label>Blocked countries</label><input id="protect-countries" value="${esc((protection.blocked_countries || []).join(', '))}" placeholder="US, ID, GB"></div>
        <div class="provider-field"><label>Blocked browsers</label><input id="protect-browsers" value="${esc((protection.blocked_browsers || []).join(', '))}" placeholder="Chrome, Firefox"></div>
      </div>
      <div class="provider-tab-panel" data-panel="requirements">
        <div class="provider-option"><div><b>Discord requirement</b><small>Require the configured Discord flow before key issuance.</small></div><input id="require-discord" type="checkbox" ${requirements.discord ? 'checked' : ''}></div>
        <div class="provider-option"><div><b>Frezen account requirement</b><small>Require an authenticated Frezen account.</small></div><input id="require-account" type="checkbox" ${requirements.account ? 'checked' : ''}></div>
        <div class="provider-requirement-note">Requirements are stored as provider configuration. They will only be enforced by the production GetKey backend when the corresponding integration is available.</div>
      </div>
      <div class="provider-modal-footer"><div class="provider-footer-warning"><span>⚠</span><div><b>${safeMeta?.key_configured ? 'SafeLinkU ready' : 'No SafeLinkU integration configured'}</b><small>${safeMeta?.key_configured ? 'This provider can reference SafeLinkU checkpoints.' : 'Configure SafeLinkU before expecting a live GetKey flow.'}</small></div></div><div class="provider-actions-row"><button class="secondary" type="button" id="provider-cancel">Cancel</button><button class="primary" type="submit" ${!services.length ? 'disabled' : ''}>${edit ? 'Save' : 'Create'}</button></div></div>
    </form>
  </section>`;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  wrap.querySelector('.provider-close').onclick = close;
  wrap.querySelector('#provider-cancel').onclick = close;
  wrap.onclick = (event) => { if (event.target === wrap) close(); };

  const activateTab = (name) => {
    wrap.querySelectorAll('.provider-tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
    wrap.querySelectorAll('.provider-tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
  };
  wrap.querySelectorAll('.provider-tab').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.tab)));

  const validity = wrap.querySelector('#provider-validity');
  const validityHours = wrap.querySelector('#provider-validity-hours');
  validity.addEventListener('input', () => { const minutes = Math.max(1, Number(validity.value || 1)); validityHours.value = (minutes / 60).toFixed(2); });
  const toggleDependency = (toggleId, fieldSelector) => { const toggle = wrap.querySelector(toggleId); const field = wrap.querySelector(fieldSelector); const sync = () => { if (field) field.style.display = toggle.checked ? '' : 'none'; }; toggle?.addEventListener('change', sync); sync(); };
  toggleDependency('#provider-hwid-toggle', '[data-depends="hwid"]');
  toggleDependency('#provider-session-toggle', '[data-depends="session"]');

  const search = wrap.querySelector('#checkpoint-search');
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    wrap.querySelectorAll('.provider-checkpoint-row').forEach((row) => { row.hidden = query && !row.dataset.name.includes(query); });
  });

  wrap.querySelector('form').onsubmit = (event) => {
    event.preventDefault();
    const name = wrap.querySelector('#provider-name').value.trim();
    const serviceId = wrap.querySelector('#provider-service').value;
    if (!name || !serviceId) return;
    const list = readJson(PROVIDERS_KEY, []);
    const selected = [...wrap.querySelectorAll('.provider-checkpoint:checked')].map((input) => input.value);
    const item = {
      id: current.id || makeId(),
      name,
      service_id: serviceId,
      type: 'safelinku',
      active: current.active !== false,
      key_validity_minutes: Math.max(1, Number(validity.value || 60)),
      user_select_mode: wrap.querySelector('#provider-user-select').checked,
      hwid_limit_enabled: wrap.querySelector('#provider-hwid-toggle').checked,
      max_hwids_per_key: Math.max(1, Number(wrap.querySelector('#provider-hwid-max').value || 1)),
      session_limit_enabled: wrap.querySelector('#provider-session-toggle').checked,
      session_limit: Math.max(1, Number(wrap.querySelector('#provider-session-limit').value || 1)),
      checkpoints: selected,
      one_time_use: wrap.querySelector('#provider-one-time').checked,
      expiry_on_first_use: wrap.querySelector('#provider-expiry-first').checked,
      streak_system: wrap.querySelector('#provider-streak').checked,
      protection: {
        visitor: wrap.querySelector('#protect-visitor').checked,
        vpn: wrap.querySelector('#protect-vpn').checked,
        adblock: wrap.querySelector('#protect-adblock').checked,
        incognito: wrap.querySelector('#protect-incognito').checked,
        blocked_countries: wrap.querySelector('#protect-countries').value.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean),
        blocked_browsers: wrap.querySelector('#protect-browsers').value.split(',').map((v) => v.trim()).filter(Boolean),
      },
      requirements: { discord: wrap.querySelector('#require-discord').checked, account: wrap.querySelector('#require-account').checked },
      updated_at: new Date().toISOString(),
    };
    writeJson(PROVIDERS_KEY, edit ? list.map((row) => row.id === item.id ? item : row) : [item, ...list]);
    close();
    renderProvider();
  };
}

function renderProvider() {
  const root = document.querySelector('#content'); if (!root) return;
  const providers = migrateLegacyProviders();
  const services = readJson(SERVICES_KEY, []);
  const safeMeta = readJson(SAFE_KEY, null);
  root.innerHTML = `<div class="provider-page"><div class="provider-header"><div class="provider-icon">⌁</div><div><h2>Providers</h2><p>Build the key-system provider that connects a Service to SafeLinkU checkpoints.</p></div></div><button class="primary provider-new" id="provider-new">＋ <span>New Provider</span></button><select class="provider-sort" aria-label="Provider sorting"><option>Name ↑</option><option>Name ↓</option><option>Status</option></select>${providers.length ? `<div class="provider-count"><b>${providers.length}</b><span>/ 10 Providers</span><i></i></div><div class="provider-list">${providers.map((provider) => { const service = services.find((s) => s.id === provider.service_id); const selected = selectedCheckpointNames(provider.checkpoints || []); const ready = Boolean(service && safeMeta?.key_configured && selected.length && provider.active !== false); return `<article class="provider-card" data-id="${esc(provider.id)}"><div class="provider-card-head"><div class="provider-logo">S</div><div><h3>${esc(provider.name)}</h3><div class="provider-type">SafeLinkU · ${esc(service?.name || 'Service not selected')}</div></div></div><div class="provider-badges"><span class="provider-badge ${ready ? '' : 'pending'}"><span class="dot"></span>${ready ? 'Active' : 'Pending'}</span><span class="provider-badge"><span class="dot">✓</span>${selected.length} Checkpoint${selected.length === 1 ? '' : 's'}</span></div><div class="provider-service"><small>Service</small><b>${esc(service?.name || 'Not configured')}</b></div><div class="provider-checkpoint-summary"><small>Checkpoint sequence</small>${selected.length ? selected.map((checkpoint) => `<span>${esc(checkpoint.name)}</span>`).join('') : '<span class="muted">No checkpoints selected</span>'}</div><div class="provider-actions"><button class="secondary configure" type="button">✎ <span>Edit</span></button><button class="secondary more" type="button">•••</button></div></article>`; }).join('')}</div>` : `<div class="provider-empty"><div class="provider-empty-icon">⌁</div><b>No providers available yet</b><span>Create a provider, connect it to a Service, and select SafeLinkU checkpoints.</span><button class="primary" id="provider-empty-new">＋ New Provider</button></div>`}</div>`;
  root.querySelector('#provider-new')?.addEventListener('click', () => openProviderModal({}));
  root.querySelector('#provider-empty-new')?.addEventListener('click', () => openProviderModal({}));
  root.querySelectorAll('.configure').forEach((button) => button.addEventListener('click', () => { const provider = providers.find((row) => row.id === button.closest('.provider-card')?.dataset.id); if (provider) openProviderModal({ edit: true, provider }); }));
  root.querySelectorAll('.more').forEach((button) => button.addEventListener('click', () => { const provider = providers.find((row) => row.id === button.closest('.provider-card')?.dataset.id); if (!provider) return; if (!confirm(`Delete provider "${provider.name}"?`)) return; writeJson(PROVIDERS_KEY, providers.filter((row) => row.id !== provider.id)); renderProvider(); }));
}

window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.provider = renderProvider;
