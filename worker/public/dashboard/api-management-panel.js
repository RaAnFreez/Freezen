(() => {
  const esc = (value) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const jsonHeaders = { accept: 'application/json', 'content-type': 'application/json' };

  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...jsonHeaders, ...(options.headers || {}) } });
    if (response.status === 401 || response.status === 403) { location.href = '/login'; return null; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  const formatDate = (value) => value ? new Date(value).toLocaleString() : 'Never';
  const scopeText = (scopes) => Array.isArray(scopes) ? scopes.join(', ') : '—';

  function renderKeyRows(keys) {
    if (!keys.length) return '<div class="empty"><b>No API keys yet</b><span>Create the first owner-scoped key below. The secret is shown only once.</span></div>';
    return keys.map((key) => {
      const state = key.revoked_at ? 'Revoked' : (key.expires_at && Date.parse(key.expires_at) <= Date.now() ? 'Expired' : 'Active');
      return `<article class="service" data-key-id="${esc(key.id)}" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
        <span style="min-width:190px"><b>${esc(key.name)}</b><small style="display:block;opacity:.7">${esc(key.key_prefix)} • ${esc(state)}</small></span>
        <span style="flex:1;min-width:180px"><small>${esc(scopeText(key.scopes))}</small><small style="display:block;opacity:.7">Expires: ${esc(formatDate(key.expires_at))} • Last used: ${esc(formatDate(key.last_used_at))}</small></span>
        <span style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="secondary api-key-usage" data-id="${esc(key.id)}">Usage</button>
          ${state === 'Active' ? `<button class="secondary api-key-rotate" data-id="${esc(key.id)}">Rotate</button><button class="secondary api-key-revoke" data-id="${esc(key.id)}">Revoke</button>` : ''}
        </span>
      </article>`;
    }).join('');
  }

  function showSecret(content, data) {
    const box = document.createElement('section');
    box.className = 'panel';
    box.innerHTML = `<div class="panel-head"><div><p class="eyebrow">ONE-TIME SECRET</p><h3>Store this API key now</h3></div></div><div class="empty"><b>${esc(data.api_key?.key_prefix || 'API key')}</b><span>The secret will not be returned again.</span><code style="display:block;overflow:auto;user-select:all;margin-top:12px;padding:12px">${esc(data.secret)}</code></div>`;
    content.prepend(box);
  }

  async function load() {
    const content = document.querySelector('#content');
    content.innerHTML = `<section class="panel loading"><div class="spinner"></div><b>Loading API management…</b><span>Reading authenticated API key access.</span></section>`;
    try {
      const [matrix, keyData] = await Promise.all([
        api('/api/v1/roles/matrix'),
        api('/api/v1/api-keys'),
      ]);
      if (!matrix || !keyData) return;
      const roles = matrix.roles || {};
      const current = matrix.current_role || 'UNKNOWN';
      const scopes = Array.isArray(roles[current]) ? roles[current] : [];
      const keys = Array.isArray(keyData.api_keys) ? keyData.api_keys : [];
      const keyCount = keys.length;

      content.innerHTML = `<section class="panel section-page">
        <div class="section-heading"><div><p class="eyebrow">API MANAGEMENT</p><h2>API Access Center</h2><p>Manage authenticated API keys without exposing secrets.</p></div><span class="badge"><span class="dot"></span>Protected</span></div>
        <div class="stats">
          <article class="stat"><div class="stat-icon">⌁</div><p>Current role</p><strong>${esc(current)}</strong><small>Server-enforced role</small></article>
          <article class="stat"><div class="stat-icon">◇</div><p>Granted scopes</p><strong>${esc(scopes.includes('*') ? 'ALL' : scopes.length)}</strong><small>Resolved from role matrix</small></article>
          <article class="stat"><div class="stat-icon">◉</div><p>API keys</p><strong>${esc(keyCount)}</strong><small>Owner-scoped active/revoked records</small></article>
          <article class="stat"><div class="stat-icon">↻</div><p>Secrets</p><strong>One-time</strong><small>Never returned by list/usage APIs</small></article>
        </div>
        <div class="columns">
          <section class="panel"><div class="panel-head"><div><p class="eyebrow">CREATE</p><h3>Create API key</h3></div></div>
            <form id="api-key-create-form" class="form-grid">
              <label>Name<input name="name" maxlength="100" required placeholder="e.g. Frezen Delivery Client"></label>
              <label>Scopes<input name="scopes" required placeholder="keys:read, keys:write"></label>
              <label>Expiration (optional)<input type="datetime-local" name="expires_at"></label>
              <button class="primary" type="submit">Create API Key</button>
            </form>
            <div id="api-key-create-status" class="empty" hidden></div>
          </section>
          <section class="panel"><div class="panel-head"><div><p class="eyebrow">SCOPES</p><h3>Current authorization scopes</h3></div></div>${scopes.length ? scopes.map((scope) => `<div class="service"><span><i class="dot"></i>${esc(scope)}</span><b>Granted</b></div>`).join('') : '<div class="empty"><b>No scopes returned</b><span>The authenticated API did not provide a permission matrix.</span></div>'}</section>
        </div>
        <section class="panel"><div class="panel-head"><div><p class="eyebrow">KEYS</p><h3>API key lifecycle</h3></div></div><div id="api-key-list">${renderKeyRows(keys)}</div></section>
      </section>`;

      document.querySelector('#api-key-create-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const scopesInput = String(form.get('scopes') || '').split(',').map((s) => s.trim()).filter(Boolean);
        const expiresRaw = String(form.get('expires_at') || '').trim();
        const status = document.querySelector('#api-key-create-status');
        status.hidden = false;
        status.innerHTML = '<b>Creating…</b><span>Generating and hashing the secret server-side.</span>';
        try {
          const data = await api('/api/v1/api-keys', { method: 'POST', body: JSON.stringify({ name: form.get('name'), scopes: scopesInput, expires_at: expiresRaw ? new Date(expiresRaw).toISOString() : null }) });
          showSecret(content, data);
          await load();
        } catch (error) {
          status.innerHTML = `<b>Unable to create API key</b><span>${esc(error.message)}</span>`;
        }
      });

      content.querySelectorAll('.api-key-revoke').forEach((button) => button.addEventListener('click', async () => {
        if (!confirm('Revoke this API key?')) return;
        try { await api(`/api/v1/api-keys/${encodeURIComponent(button.dataset.id)}/revoke`, { method: 'POST' }); await load(); }
        catch (error) { alert(`Unable to revoke API key: ${error.message}`); }
      }));

      content.querySelectorAll('.api-key-rotate').forEach((button) => button.addEventListener('click', async () => {
        if (!confirm('Rotate this API key? The current key will be revoked.')) return;
        try { const data = await api(`/api/v1/api-keys/${encodeURIComponent(button.dataset.id)}/rotate`, { method: 'POST', body: '{}' }); showSecret(content, data); await load(); }
        catch (error) { alert(`Unable to rotate API key: ${error.message}`); }
      }));

      content.querySelectorAll('.api-key-usage').forEach((button) => button.addEventListener('click', async () => {
        try {
          const data = await api(`/api/v1/api-keys/${encodeURIComponent(button.dataset.id)}/usage`);
          alert(`API Key: ${data.usage?.name || '—'}\nLast used: ${formatDate(data.usage?.last_used_at)}\nCreated: ${formatDate(data.usage?.created_at)}\nExpires: ${formatDate(data.usage?.expires_at)}`);
        } catch (error) { alert(`Unable to load usage: ${error.message}`); }
      }));
    } catch (error) {
      content.innerHTML = `<section class="hero error"><div><p class="eyebrow">API MANAGEMENT ERROR</p><h2>Unable to load API management</h2><p>The authenticated API returned an error: ${esc(error.message)}</p></div><button class="primary" id="retry-api-management">Retry</button></section>`;
      document.querySelector('#retry-api-management').onclick = load;
    }
  }

  window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
  window.FrezenDashboardPanels.apiManagement = load;
})();
