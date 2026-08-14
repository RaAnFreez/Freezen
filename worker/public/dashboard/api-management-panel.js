(() => {
  const esc = (value) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  async function load() {
    const content = document.querySelector('#content');
    content.innerHTML = `<section class="panel loading"><div class="spinner"></div><b>Loading API management…</b><span>Reading authenticated permission scopes.</span></section>`;
    try {
      const response = await fetch('/api/v1/roles/matrix', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (response.status === 401 || response.status === 403) { location.href = '/login'; return; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const roles = data.roles || {};
      const current = data.current_role || 'UNKNOWN';
      const scopes = Array.isArray(roles[current]) ? roles[current] : [];
      content.innerHTML = `<section class="panel section-page">
        <div class="section-heading"><div><p class="eyebrow">API MANAGEMENT</p><h2>API Access Center</h2><p>Manage the authorization boundary used by Frezen APIs.</p></div><span class="badge"><span class="dot"></span>Authenticated</span></div>
        <div class="stats">
          <article class="stat"><div class="stat-icon">⌁</div><p>Current role</p><strong>${esc(current)}</strong><small>Server-enforced role</small></article>
          <article class="stat"><div class="stat-icon">◇</div><p>Granted scopes</p><strong>${esc(scopes.includes('*') ? 'ALL' : scopes.length)}</strong><small>Resolved from role matrix</small></article>
          <article class="stat"><div class="stat-icon">◉</div><p>API keys</p><strong>Not configured</strong><small>Secure key storage is the next backend step</small></article>
          <article class="stat"><div class="stat-icon">↻</div><p>Rotation</p><strong>Protected</strong><small>No secret is exposed to this UI</small></article>
        </div>
        <div class="columns"><section class="panel"><div class="panel-head"><div><p class="eyebrow">SCOPES</p><h3>Current authorization scopes</h3></div></div>${scopes.length ? scopes.map((scope) => `<div class="service"><span><i class="dot"></i>${esc(scope)}</span><b>Granted</b></div>`).join('') : '<div class="empty"><b>No scopes returned</b><span>The authenticated API did not provide a permission matrix.</span></div>'}</section>
        <section class="panel"><div class="panel-head"><div><p class="eyebrow">SECURITY</p><h3>API key boundary</h3></div></div><div class="empty"><b>Key issuance is not enabled yet</b><span>Phase 14 will add hashed key storage, scopes, expiration, revoke, rotation and usage tracking only after the production D1 migration is reviewed.</span></div></section></div>
      </section>`;
    } catch (error) {
      content.innerHTML = `<section class="hero error"><div><p class="eyebrow">API MANAGEMENT ERROR</p><h2>Unable to load API management</h2><p>The authenticated authorization API returned an error: ${esc(error.message)}</p></div><button class="primary" id="retry-api-management">Retry</button></section>`;
      document.querySelector('#retry-api-management').onclick = load;
    }
  }

  window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
  window.FrezenDashboardPanels.apiManagement = load;
})();
