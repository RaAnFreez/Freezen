(() => {
  const esc = (v) => String(v ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const content = () => document.querySelector('#content');
  let page = 1;
  let search = '';
  let status = '';

  const css = document.createElement('style');
  css.textContent = `
    .license-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:18px}.license-toolbar input,.license-toolbar select{min-height:42px;border:1px solid rgba(255,255,255,.1);background:#0d1219;color:inherit;border-radius:10px;padding:0 12px}.license-toolbar input{flex:1;min-width:180px}.license-toolbar button,.license-actions button{min-height:42px;border:0;border-radius:10px;padding:0 14px;cursor:pointer}.license-toolbar .primary,.license-actions .primary{background:#fff;color:#080b10}.license-table{width:100%;overflow:auto}.license-table table{width:100%;border-collapse:collapse;min-width:760px}.license-table th,.license-table td{text-align:left;padding:13px 10px;border-bottom:1px solid rgba(255,255,255,.07);font-size:13px}.license-table th{color:#8d98a8;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.license-id{font-family:ui-monospace,monospace}.license-status{display:inline-flex;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.07);font-size:11px;text-transform:uppercase}.license-status.active{background:rgba(80,220,140,.13);color:#8ff0b5}.license-status.revoked,.license-status.banned{background:rgba(255,90,90,.12);color:#ff9b9b}.license-status.expired{background:rgba(255,190,70,.12);color:#ffd07a}.license-actions{display:flex;gap:6px;flex-wrap:wrap}.license-actions button{min-height:32px;padding:0 9px;background:#151c26;color:#dbe2eb}.license-actions button.danger{color:#ffabab}.license-key-result{margin:14px 0;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#0b1017}.license-key-result code{display:block;word-break:break-all;margin-top:8px;color:#fff}.license-message{padding:12px;border-radius:10px;background:#101721;margin-bottom:14px}.license-message.error{color:#ffaaaa}.license-message.ok{color:#a6f4c2}.license-pagination{display:flex;align-items:center;justify-content:space-between;margin-top:16px;color:#8d98a8}.license-pagination button{background:#151c26;color:#fff;border:0;border-radius:8px;padding:8px 12px}.license-empty{padding:30px;text-align:center;color:#8d98a8}
  `;
  document.head.appendChild(css);

  async function api(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json', ...(options.body ? {'content-type':'application/json'} : {}) }, ...options });
    if (response.status === 401 || response.status === 403) { location.href = '/login'; return null; }
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function shell() {
    const root = content();
    root.innerHTML = `<section class="panel"><div class="section-heading"><div><p class="eyebrow">LICENSE MANAGEMENT</p><h2>Licenses</h2><p>Create, search and safely manage the license lifecycle from one authenticated control panel.</p></div><span class="badge"><span class="dot"></span>Protected</span></div><div id="license-message"></div><div class="license-toolbar"><input id="license-search" placeholder="Search ID, email, username or product…"><select id="license-status"><option value="">All statuses</option><option value="unused">Unused</option><option value="active">Active</option><option value="expired">Expired</option><option value="revoked">Revoked</option><option value="banned">Banned</option></select><button id="license-refresh">Refresh</button><button id="license-create" class="primary">+ Create license</button></div><div id="license-create-form"></div><div id="license-table" class="license-table"></div></section>`;
    document.querySelector('#license-search').value = search;
    document.querySelector('#license-status').value = status;
    document.querySelector('#license-search').onkeydown = (e) => { if (e.key === 'Enter') { search = e.target.value.trim(); page = 1; load(); } };
    document.querySelector('#license-status').onchange = (e) => { status = e.target.value; page = 1; load(); };
    document.querySelector('#license-refresh').onclick = load;
    document.querySelector('#license-create').onclick = toggleCreate;
    load();
  }

  function message(text, kind = 'ok') {
    const node = document.querySelector('#license-message');
    if (node) node.innerHTML = text ? `<div class="license-message ${kind}">${esc(text)}</div>` : '';
  }

  function toggleCreate() {
    const node = document.querySelector('#license-create-form');
    if (node.innerHTML) { node.innerHTML = ''; return; }
    node.innerHTML = `<section class="panel" style="margin-bottom:18px"><div class="panel-head"><div><p class="eyebrow">NEW LICENSE</p><h3>Create license</h3></div></div><form id="license-form"><div class="license-toolbar"><input name="product_id" required placeholder="Product ID"><input name="duration_days" type="number" min="1" max="3650" placeholder="Duration days"><input name="max_devices" type="number" min="1" max="100" value="1" placeholder="Max devices"><button class="primary" type="submit">Generate</button></div></form></section>`;
    document.querySelector('#license-form').onsubmit = async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(event.currentTarget));
      if (!body.duration_days) delete body.duration_days;
      body.max_devices = Number(body.max_devices || 1);
      try {
        const data = await api('/api/v1/licenses', { method:'POST', body:JSON.stringify(body) });
        node.innerHTML = `<div class="license-key-result"><b>License created successfully.</b><span>Copy this key now. Frezen does not store the plaintext key.</span><code>${esc(data.license_key)}</code></div>`;
        message('License created.', 'ok');
        page = 1;
        load();
      } catch (error) { message(error.message, 'error'); }
    };
  }

  async function action(url, method = 'POST', body = null) {
    try {
      await api(url, { method, ...(body ? {body:JSON.stringify(body)} : {}) });
      message('Action completed successfully.', 'ok');
      await load();
    } catch (error) { message(error.message, 'error'); }
  }

  function row(license) {
    const statusClass = esc(license.status);
    const id = encodeURIComponent(license.id);
    return `<tr><td><span class="license-id">${esc(license.id)}</span></td><td>${esc(license.product_name || license.product_id)}</td><td>${esc(license.username || license.email || 'Unassigned')}</td><td><span class="license-status ${statusClass}">${esc(license.status)}</span></td><td>${esc(license.expires_at || 'No expiry')}</td><td>${esc(license.max_devices)}</td><td><div class="license-actions">${license.status !== 'revoked' ? `<button data-action="revoke" data-id="${id}" class="danger">Revoke</button>` : ''}${license.status !== 'active' && license.status !== 'banned' ? `<button data-action="activate" data-id="${id}">Activate</button>` : ''}<button data-action="extend" data-id="${id}">+30d</button><button data-action="hwid" data-id="${id}">Reset HWID</button></div></td></tr>`;
  }

  async function load() {
    const table = document.querySelector('#license-table');
    if (!table) return;
    table.innerHTML = `<div class="license-empty">Loading licenses…</div>`;
    try {
      const params = new URLSearchParams({page:String(page),page_size:'20'});
      if (search) params.set('q', search);
      if (status) params.set('status', status);
      const data = await api(`/api/v1/licenses?${params}`);
      const licenses = data?.licenses || [];
      if (!licenses.length) { table.innerHTML = `<div class="license-empty">No licenses found.</div>`; return; }
      table.innerHTML = `<table><thead><tr><th>ID</th><th>Product</th><th>Owner</th><th>Status</th><th>Expires</th><th>Devices</th><th>Actions</th></tr></thead><tbody>${licenses.map(row).join('')}</tbody></table><div class="license-pagination"><span>Page ${esc(data.pagination?.page)} of ${esc(data.pagination?.total_pages || 1)} · ${esc(data.pagination?.total || 0)} total</span><span><button id="license-prev" ${page <= 1 ? 'disabled' : ''}>‹</button> <button id="license-next" ${page >= (data.pagination?.total_pages || 1) ? 'disabled' : ''}>›</button></span></div>`;
      document.querySelector('#license-prev').onclick = () => { if (page > 1) { page--; load(); } };
      document.querySelector('#license-next').onclick = () => { if (page < (data.pagination?.total_pages || 1)) { page++; load(); } };
      table.querySelectorAll('[data-action]').forEach((button) => button.onclick = () => {
        const id = decodeURIComponent(button.dataset.id);
        const actionName = button.dataset.action;
        if (actionName === 'revoke') action(`/api/v1/licenses/${encodeURIComponent(id)}/status`, 'PATCH', {status:'revoked'});
        if (actionName === 'activate') action(`/api/v1/licenses/${encodeURIComponent(id)}/status`, 'PATCH', {status:'active'});
        if (actionName === 'extend') action(`/api/v1/licenses/${encodeURIComponent(id)}/extend`, 'POST', {duration_days:30});
        if (actionName === 'hwid') action(`/api/v1/licenses/${encodeURIComponent(id)}/hwid/reset`, 'POST');
      });
    } catch (error) {
      table.innerHTML = `<div class="license-empty">Unable to load licenses: ${esc(error.message)}</div>`;
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-section="licenses"]');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.section === 'licenses'));
    const title = document.querySelector('#title');
    if (title) title.textContent = 'Licenses';
    shell();
  }, true);
})();
