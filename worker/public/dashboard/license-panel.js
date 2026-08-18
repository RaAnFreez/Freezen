(() => {
  const esc = (v) => String(v ?? '—').replace(/[&<>\"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;' }[c]));
  const content = () => document.querySelector('#content');
  const state = {
    page: 1, q: '', status: '', providerId: '', serviceId: '', folderId: '',
    options: { providers: [], services: [], folders: [] },
  };

  const css = document.createElement('style');
  css.textContent = `
    .key-control{position:relative}.key-control *{box-sizing:border-box}.key-hero{display:flex;gap:18px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}.key-hero-copy h2{margin:4px 0 8px}.key-hero-copy p{margin:0;max-width:680px;color:#8d98a8;line-height:1.5}.key-hero-actions{display:flex;gap:8px;align-items:center}.key-button{border:0;border-radius:10px;min-height:42px;padding:0 16px;font:inherit;font-weight:700;cursor:pointer}.key-button.primary{background:linear-gradient(135deg,#ab63ff,#8b45ea);color:#fff;box-shadow:0 8px 24px rgba(153,78,238,.22)}.key-button.secondary{background:#141b25;color:#dce5f0;border:1px solid rgba(255,255,255,.08)}.key-button.danger{color:#ffaaaa}.key-button:disabled{opacity:.55;cursor:not-allowed}.key-toolbar{display:grid;grid-template-columns:minmax(180px,1.7fr) repeat(3,minmax(120px,1fr)) auto;gap:10px;margin:20px 0}.key-toolbar input,.key-toolbar select{width:100%;min-height:42px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:#0d131c;color:#ecf2f8;padding:0 12px;font:inherit}.key-stat{display:flex;gap:10px;align-items:center;padding:14px;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:#0e151f;margin-bottom:16px}.key-stat strong{font-size:24px}.key-stat small{color:#7e8b9b}.key-progress{height:7px;background:#1a2330;border-radius:999px;overflow:hidden;flex:1}.key-progress i{display:block;height:100%;background:#a45cff;border-radius:999px}.key-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.key-card{border:1px solid rgba(255,255,255,.07);border-radius:16px;background:#0f1620;padding:16px}.key-card-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.key-card-name{font-weight:800;font-size:16px}.key-card-sub{margin-top:3px;color:#7f8c9c;font-size:12px}.key-card-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}.key-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 9px;background:#131c27;color:#aeb9c7;font-size:11px}.key-chip.ok{background:rgba(80,220,140,.12);color:#88efb3}.key-chip.premium{background:rgba(255,193,83,.12);color:#ffd47e}.key-card-id{margin-top:12px;color:#758297;font-family:ui-monospace,monospace;font-size:11px;word-break:break-all}.key-card-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.key-card-actions button{min-height:34px}.key-empty{padding:44px 18px;text-align:center;border:1px dashed rgba(255,255,255,.09);border-radius:16px;color:#8995a5}.key-empty .empty-icon{width:44px;height:44px;display:grid;place-items:center;border-radius:12px;background:#21172e;color:#b164ff;margin:0 auto 12px;font-size:22px}.key-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:16px;color:#7f8b9b;font-size:12px}.key-modal{position:fixed;inset:0;background:rgba(0,0,0,.62);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;z-index:1200}.key-modal-panel{width:min(100%,720px);max-height:92vh;overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:#1b1723;box-shadow:0 30px 100px rgba(0,0,0,.55)}.key-modal-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:18px 20px 14px;border-bottom:1px solid rgba(255,255,255,.06)}.key-modal-head h3{margin:4px 0 4px;font-size:18px}.key-modal-head p{margin:0;color:#8f9aab;font-size:12px}.key-close{border:0;background:transparent;color:#aab4c2;font-size:24px;cursor:pointer}.key-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:12px 14px;background:#14111a}.key-tab{border:0;border-radius:8px;background:transparent;color:#8c97a8;padding:9px;font:inherit;cursor:pointer}.key-tab.active{background:#23182e;color:#fff}.key-modal-body{padding:18px 20px}.key-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.key-field{display:flex;flex-direction:column;gap:7px}.key-field.full{grid-column:1/-1}.key-field label{font-size:12px;color:#dce4ed}.key-field input,.key-field select{min-height:42px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:#0d1219;color:#fff;padding:0 12px;font:inherit}.key-field input:focus,.key-field select:focus{outline:none;border-color:#9d5cff;box-shadow:0 0 0 2px rgba(157,92,255,.12)}.key-inline{display:grid;grid-template-columns:1fr auto;gap:8px}.key-validity{margin-top:16px;padding:14px;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:#16121c}.key-validity-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.key-validity-head strong{font-size:13px}.key-presets{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}.key-preset{border:1px solid rgba(255,255,255,.06);border-radius:999px;background:#111720;color:#9aa6b5;padding:7px 11px;font-size:11px;cursor:pointer}.key-preset.active{background:#a45cff;color:#fff;border-color:#a45cff}.key-time-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.key-toggle-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 0;border-top:1px solid rgba(255,255,255,.06);margin-top:12px}.key-toggle-copy strong{display:block;font-size:13px}.key-toggle-copy span{display:block;margin-top:3px;color:#7d899a;font-size:11px}.key-switch{position:relative;width:50px;height:30px;flex:none}.key-switch input{opacity:0;width:0;height:0}.key-switch span{position:absolute;inset:0;border-radius:999px;background:#2a2433;cursor:pointer;transition:.18s}.key-switch span:before{content:'';position:absolute;width:22px;height:22px;top:4px;left:4px;border-radius:50%;background:#0f0d14;transition:.18s}.key-switch input:checked+span{background:#a45cff}.key-switch input:checked+span:before{transform:translateX(20px)}.key-advanced{margin-top:14px;border-top:1px solid rgba(255,255,255,.06);padding-top:14px}.key-advanced summary{cursor:pointer;color:#aab5c3;font-size:12px}.key-advanced-body{margin-top:12px}.key-modal-foot{display:flex;gap:8px;justify-content:flex-end;padding:14px 20px;border-top:1px solid rgba(255,255,255,.06)}.key-result{margin-top:14px;padding:14px;border-radius:12px;background:#0e1713;border:1px solid rgba(80,220,140,.2)}.key-result code{display:block;margin-top:8px;word-break:break-all;color:#dff8e8;font-family:ui-monospace,monospace}.key-result-actions{display:flex;gap:8px;margin-top:10px}.key-message{margin-bottom:14px;padding:11px 12px;border-radius:10px;background:#111a25;color:#b7c2d0}.key-message.error{background:#28181c;color:#ffb0b0}.key-message.ok{background:#122018;color:#a7efc1}
    @media (max-width:900px){.key-toolbar{grid-template-columns:1fr 1fr}.key-toolbar input{grid-column:1/-1}.key-grid{grid-template-columns:1fr}.key-field-grid{grid-template-columns:1fr}.key-field.full{grid-column:auto}.key-modal{align-items:flex-end;padding:8px}.key-modal-panel{max-height:95vh;border-radius:18px 18px 12px 12px}.key-modal-foot{position:sticky;bottom:0;background:#1b1723}.key-time-grid{grid-template-columns:1fr}.key-tabs{grid-template-columns:repeat(3,1fr);overflow:auto}.key-tabs .key-tab{font-size:11px}}
  `;
  document.head.appendChild(css);

  async function api(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) }, ...options });
    if (response.status === 401 || response.status === 403) { location.href = '/login'; return null; }
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  }

  function shell() {
    content().innerHTML = `<section class="panel key-control"><div class="key-hero"><div class="key-hero-copy"><p class="eyebrow">KEY SYSTEM</p><h2>Keys</h2><p>Generate and manage keys that are linked directly to your configured Provider and Service.</p></div><div class="key-hero-actions"><button class="key-button primary" id="key-create">＋ Create Key</button></div></div><div id="key-message"></div><div class="key-toolbar"><input id="key-search" placeholder="Search key name, ID, provider or service…"><select id="key-status"><option value="">All statuses</option><option value="unused">Unused</option><option value="active">Active</option><option value="expired">Expired</option><option value="revoked">Revoked</option><option value="banned">Banned</option></select><select id="key-provider-filter"><option value="">All providers</option></select><select id="key-service-filter"><option value="">All services</option></select><button class="key-button secondary" id="key-refresh">Refresh</button></div><div id="key-summary"></div><div id="key-list"></div><div id="key-pagination"></div></section>`;
    bindShell();
    loadOptions().then(() => loadKeys()).catch(showError);
  }

  function bindShell() {
    document.querySelector('#key-create').onclick = () => openCreateModal();
    document.querySelector('#key-refresh').onclick = () => loadKeys();
    document.querySelector('#key-search').onkeydown = (event) => { if (event.key === 'Enter') { state.q = event.target.value.trim(); state.page = 1; loadKeys(); } };
    document.querySelector('#key-status').onchange = (event) => { state.status = event.target.value; state.page = 1; loadKeys(); };
    document.querySelector('#key-provider-filter').onchange = (event) => { state.providerId = event.target.value; state.page = 1; loadKeys(); };
    document.querySelector('#key-service-filter').onchange = (event) => { state.serviceId = event.target.value; state.page = 1; loadKeys(); };
  }

  function showMessage(text, kind = 'ok') {
    const node = document.querySelector('#key-message');
    if (!node) return;
    node.innerHTML = text ? `<div class="key-message ${kind}">${esc(text)}</div>` : '';
  }
  const showError = (error) => showMessage(error?.message || String(error), 'error');

  async function loadOptions() {
    const data = await api('/api/v1/key-control/options');
    state.options = { providers: data.providers || [], services: data.services || [], folders: data.folders || [] };
    const pf = document.querySelector('#key-provider-filter');
    const sf = document.querySelector('#key-service-filter');
    if (!pf || !sf) return;
    pf.innerHTML = `<option value="">All providers</option>${state.options.providers.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}`;
    sf.innerHTML = `<option value="">All services</option>${state.options.services.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}`;
    pf.value = state.providerId;
    sf.value = state.serviceId;
  }

  async function loadKeys() {
    const list = document.querySelector('#key-list');
    if (!list) return;
    list.innerHTML = `<div class="key-empty"><div class="empty-icon">◌</div><strong>Loading keys…</strong></div>`;
    try {
      const query = new URLSearchParams({ page: String(state.page), page_size: '12' });
      if (state.q) query.set('q', state.q);
      if (state.status) query.set('status', state.status);
      if (state.providerId) query.set('provider_id', state.providerId);
      if (state.serviceId) query.set('service_id', state.serviceId);
      if (state.folderId) query.set('folder_id', state.folderId);
      const data = await api(`/api/v1/key-control/keys?${query}`);
      const keys = data.keys || [];
      const total = Number(data.pagination?.total || 0);
      const pages = Number(data.pagination?.total_pages || 1);
      const percent = Math.min(100, Math.round((total / Math.max(total, 20)) * 100));
      document.querySelector('#key-summary').innerHTML = `<div class="key-stat"><div><strong>${total}</strong><small> total keys</small></div><div class="key-progress"><i style="width:${percent}%"></i></div><span class="key-chip">Provider + Service linked</span></div>`;
      if (!keys.length) {
        list.innerHTML = `<div class="key-empty"><div class="empty-icon">⌁</div><strong>No keys available yet.</strong><div>Create your first key to start managing access.</div></div>`;
      } else {
        list.innerHTML = `<div class="key-grid">${keys.map(renderCard).join('')}</div>`;
        list.querySelectorAll('[data-copy-id]').forEach((button) => button.onclick = () => navigator.clipboard?.writeText(button.dataset.copyId).then(() => showMessage('Key ID copied.', 'ok')).catch(() => showMessage('Unable to copy key ID.', 'error')));
        list.querySelectorAll('[data-action]').forEach((button) => button.onclick = () => runAction(button.dataset.action, button.dataset.licenseId));
      }
      document.querySelector('#key-pagination').innerHTML = `<div class="key-pagination"><span>Page ${data.pagination?.page || state.page} / ${pages} · ${total} key${total === 1 ? '' : 's'}</span><span><button class="key-button secondary" id="key-prev" ${state.page <= 1 ? 'disabled' : ''}>‹</button> <button class="key-button secondary" id="key-next" ${state.page >= pages ? 'disabled' : ''}>›</button></span></div>`;
      document.querySelector('#key-prev').onclick = () => { if (state.page > 1) { state.page--; loadKeys(); } };
      document.querySelector('#key-next').onclick = () => { if (state.page < pages) { state.page++; loadKeys(); } };
    } catch (error) {
      list.innerHTML = `<div class="key-empty"><div class="empty-icon">!</div><strong>Unable to load keys</strong><div>${esc(error.message)}</div></div>`;
      document.querySelector('#key-summary').innerHTML = '';
      document.querySelector('#key-pagination').innerHTML = '';
    }
  }

  function renderCard(key) {
    const status = String(key.status || 'unknown').toLowerCase();
    const statusClass = status === 'active' || status === 'unused' ? 'ok' : status === 'expired' || status === 'revoked' || status === 'banned' ? 'premium' : '';
    return `<article class="key-card"><div class="key-card-top"><div><div class="key-card-name">${esc(key.key_name || 'Unnamed key')}</div><div class="key-card-sub">${esc(key.provider_name || 'Provider unavailable')} · ${esc(key.service_name || 'All services')}</div></div>${key.premium ? '<span class="key-chip premium">★ Premium</span>' : ''}</div><div class="key-card-meta"><span class="key-chip ${statusClass}">${esc(status.toUpperCase())}</span><span class="key-chip">${key.forever ? 'Forever' : (key.expires_at ? `Expires ${esc(new Date(key.expires_at).toLocaleString())}` : 'No expiry')}</span><span class="key-chip">${esc(key.max_devices)} device${Number(key.max_devices) === 1 ? '' : 's'}</span>${key.folder_name ? `<span class="key-chip">Folder: ${esc(key.folder_name)}</span>` : ''}</div><div class="key-card-id">${esc(key.id)} · license ${esc(key.license_id)}</div><div class="key-card-actions"><button class="key-button secondary" data-copy-id="${esc(key.id)}">Copy ID</button>${status !== 'revoked' ? `<button class="key-button secondary" data-action="revoke" data-license-id="${esc(key.license_id)}">Revoke</button>` : ''}${status !== 'active' && status !== 'banned' ? `<button class="key-button secondary" data-action="activate" data-license-id="${esc(key.license_id)}">Activate</button>` : ''}<button class="key-button secondary" data-action="extend" data-license-id="${esc(key.license_id)}">+30d</button><button class="key-button secondary" data-action="hwid" data-license-id="${esc(key.license_id)}">Reset HWID</button></div></article>`;
  }

  async function runAction(action, licenseId) {
    let url = '', method = 'POST', body;
    if (action === 'revoke' || action === 'activate') { url = `/api/v1/licenses/${encodeURIComponent(licenseId)}/status`; method = 'PATCH'; body = { status: action === 'revoke' ? 'revoked' : 'active' }; }
    if (action === 'extend') { url = `/api/v1/licenses/${encodeURIComponent(licenseId)}/extend`; body = { duration_days: 30 }; }
    if (action === 'hwid') { url = `/api/v1/licenses/${encodeURIComponent(licenseId)}/hwid/reset`; }
    if (!url || !window.confirm(`Confirm ${action} for this key?`)) return;
    try { await api(url, { method, body: body ? JSON.stringify(body) : undefined }); showMessage(`Key action ${action} completed.`, 'ok'); await loadKeys(); } catch (error) { showError(error); }
  }

  function openCreateModal() {
    const modal = document.createElement('div');
    modal.className = 'key-modal';
    modal.innerHTML = `<div class="key-modal-panel" role="dialog" aria-modal="true"><div class="key-modal-head"><div><p class="eyebrow">KEY SYSTEM</p><h3>Create key</h3><p>Generate a key that is tied to your Provider and Service configuration.</p></div><button class="key-close" aria-label="Close">×</button></div><div class="key-tabs"><button class="key-tab active">General</button><button class="key-tab">Security</button><button class="key-tab">Advanced</button></div><div class="key-modal-body"><form id="create-key-form"><div class="key-field-grid"><div class="key-field"><label>Provider *</label><select name="provider_id" id="create-provider" required>${state.options.providers.map((p) => `<option value="${esc(p.id)}" data-service="${esc(p.service_id || '')}">${esc(p.name)}</option>`).join('')}</select></div><div class="key-field"><label>Service</label><select name="service_id" id="create-service"><option value="">All</option>${state.options.services.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></div><div class="key-field"><label>Folder <span style="color:#7f8a9a">(optional)</span></label><select name="folder_id" id="create-folder"><option value="">None</option>${state.options.folders.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select><button type="button" class="key-button secondary" id="new-folder-toggle" style="margin-top:7px">＋ New folder name</button><div id="new-folder-box" hidden style="margin-top:8px"><div class="key-inline"><input id="new-folder-name" placeholder="Folder name" maxlength="80"><button class="key-button secondary" type="button" id="new-folder-create">Create</button></div></div></div><div class="key-field"><label>Key name <span style="color:#7f8a9a">(optional)</span></label><input name="key_name" maxlength="100" placeholder="Key name"></div></div><div class="key-validity"><div class="key-validity-head"><strong>Validity</strong><span class="key-chip" id="validity-summary">1h</span></div><div class="key-presets">${['1h','24h','7d','30d','90d'].map((v, i) => `<button type="button" class="key-preset ${i === 0 ? 'active' : ''}" data-preset="${v}">${v}</button>`).join('')}</div><div class="key-time-grid"><div class="key-field"><label>Days</label><input type="number" name="days" id="valid-days" min="0" max="3650" value="0"></div><div class="key-field"><label>Hours</label><input type="number" name="hours" id="valid-hours" min="0" max="87599" value="1"></div><div class="key-field"><label>Minutes</label><input type="number" name="minutes" id="valid-minutes" min="0" max="5255999" value="0"></div></div><div class="key-toggle-row"><div class="key-toggle-copy"><strong>Forever</strong><span>Do not set an expiry time.</span></div><label class="key-switch"><input type="checkbox" name="forever" id="valid-forever"><span></span></label></div><div class="key-toggle-row"><div class="key-toggle-copy"><strong>Premium Key</strong><span>Mark this key as premium for downstream access rules.</span></div><label class="key-switch"><input type="checkbox" name="premium" id="key-premium"><span></span></label></div></div><details class="key-advanced"><summary>Advanced Options</summary><div class="key-advanced-body"><div class="key-field"><label>Max devices</label><input type="number" name="max_devices" min="1" max="100" value="1"></div></div></details><div id="create-key-message" class="key-message" hidden></div><div id="created-key-result"></div></form></div><div class="key-modal-foot"><button type="button" class="key-button secondary" id="key-cancel">Cancel</button><button type="submit" form="create-key-form" class="key-button primary" id="key-generate">Create</button></div></div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.key-close').onclick = close;
    modal.querySelector('#key-cancel').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    const provider = modal.querySelector('#create-provider');
    const service = modal.querySelector('#create-service');
    const folder = modal.querySelector('#create-folder');
    const days = modal.querySelector('#valid-days');
    const hours = modal.querySelector('#valid-hours');
    const minutes = modal.querySelector('#valid-minutes');
    const forever = modal.querySelector('#valid-forever');
    const summary = modal.querySelector('#validity-summary');
    const msg = modal.querySelector('#create-key-message');
    const result = modal.querySelector('#created-key-result');
    const syncValidity = () => { const label = forever.checked ? 'Forever' : `${Number(days.value || 0)}d ${Number(hours.value || 0)}h ${Number(minutes.value || 0)}m`; summary.textContent = label; [days, hours, minutes].forEach((input) => { input.disabled = forever.checked; }); };
    syncValidity();

    const filterProviders = () => {
      const sid = service.value;
      [...provider.options].forEach((option) => { const ownerService = option.dataset.service || ''; option.hidden = Boolean(sid && ownerService && ownerService !== sid); });
      if (provider.selectedOptions[0]?.hidden) provider.selectedIndex = [...provider.options].findIndex((option) => !option.hidden);
    };
    service.onchange = filterProviders;
    filterProviders();

    modal.querySelectorAll('.key-preset').forEach((button) => button.onclick = () => {
      modal.querySelectorAll('.key-preset').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      const preset = button.dataset.preset;
      const map = { '1h':[0,1,0], '24h':[1,0,0], '7d':[7,0,0], '30d':[30,0,0], '90d':[90,0,0] }[preset];
      [days.value, hours.value, minutes.value] = map.map(String);
      forever.checked = false;
      syncValidity();
    });
    [days, hours, minutes].forEach((input) => input.oninput = () => { modal.querySelectorAll('.key-preset').forEach((item) => item.classList.remove('active')); syncValidity(); });
    forever.onchange = syncValidity;

    modal.querySelector('#new-folder-toggle').onclick = () => { const box = modal.querySelector('#new-folder-box'); box.hidden = !box.hidden; if (!box.hidden) modal.querySelector('#new-folder-name').focus(); };
    modal.querySelector('#new-folder-create').onclick = async () => {
      const input = modal.querySelector('#new-folder-name');
      const name = input.value.trim();
      if (!name) return;
      try { const data = await api('/api/v1/key-control/folders', { method:'POST', body: JSON.stringify({ name }) }); await loadOptions(); folder.innerHTML = `<option value="">None</option>${state.options.folders.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}`; folder.value = data.folder.id; input.value = ''; showMessage('Folder created.', 'ok'); } catch (error) { showError(error); }
    };

    modal.querySelector('#create-key-form').onsubmit = async (event) => {
      event.preventDefault();
      msg.hidden = true; result.innerHTML = '';
      const form = new FormData(event.currentTarget);
      const payload = {
        provider_id: form.get('provider_id'), service_id: form.get('service_id') || null, folder_id: form.get('folder_id') || null,
        key_name: form.get('key_name') || null, days: Number(form.get('days') || 0), hours: Number(form.get('hours') || 0), minutes: Number(form.get('minutes') || 0),
        forever: forever.checked, premium: modal.querySelector('#key-premium').checked, max_devices: Number(form.get('max_devices') || 1),
      };
      const button = modal.querySelector('#key-generate');
      button.disabled = true;
      try {
        const data = await api('/api/v1/key-control/keys', { method:'POST', body: JSON.stringify(payload) });
        result.innerHTML = `<div class="key-result"><strong>Key created successfully</strong><div style="margin-top:4px;color:#8d9aab;font-size:12px">Copy it now. Frezen never stores the plaintext key.</div><code>${esc(data.license_key)}</code><div class="key-result-actions"><button type="button" class="key-button secondary" id="copy-created-key">Copy key</button><button type="button" class="key-button primary" id="done-created-key">Done</button></div></div>`;
        modal.querySelector('#copy-created-key').onclick = () => navigator.clipboard?.writeText(data.license_key).then(() => showMessage('Key copied to clipboard.', 'ok')).catch(() => showMessage('Unable to copy key.', 'error'));
        modal.querySelector('#done-created-key').onclick = close;
        showMessage('Key created and linked to the selected Provider and Service.', 'ok');
        await loadKeys();
      } catch (error) {
        msg.hidden = false; msg.className = 'key-message error'; msg.textContent = error.message;
      } finally { button.disabled = false; }
    };
  }

  window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
  window.FrezenDashboardPanels.licenses = shell;
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', shell, { once: true });
})();
