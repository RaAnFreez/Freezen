const esc = (value) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) {
    location.href = '/login';
    throw new Error('Authentication required');
  }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function badge(ok, text) {
  return `<span class="badge"><span class="dot"></span>${esc(text || (ok ? 'Configured' : 'Not configured'))}</span>`;
}

function stat(label, value, note) {
  return `<article class="stat"><p>${esc(label)}</p><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
}

async function loadSafeLinkU() {
  const root = document.querySelector('#safelinku-root');
  if (!root) return;
  root.innerHTML = `<section class="panel loading"><div class="spinner"></div><b>Loading SafeLinkU integration…</b><span>Checking protected provider configuration.</span></section>`;

  try {
    const [status, stats] = await Promise.all([
      api('/api/v1/safelinku/status'),
      api('/api/v1/safelinku/stats'),
    ]);
    const configured = Boolean(status.configured);
    const last = stats.last_request;
    root.innerHTML = `
      <section class="hero">
        <div><p class="eyebrow">SAFE LINK U</p><h2>SafeLinkU Integration</h2><p>Protected provider controls, connection diagnostics and request telemetry.</p></div>
        ${badge(configured, configured ? 'Configured' : 'Not configured')}
      </section>
      <div class="stats">
        ${stat('Provider', 'SafeLinkU', 'Integration target')}
        ${stat('API Key', status.api_key_configured ? 'Configured' : 'Missing', 'Secret is never displayed')}
        ${stat('Base URL', status.base_url_configured ? 'Configured' : 'Missing', status.base_url || 'Not configured')}
        ${stat('Successful', Number(stats.successful_claims || 0), 'Recorded successful requests')}
        ${stat('Failed', Number(stats.failed_claims || 0), 'Recorded failed requests')}
      </div>
      <div class="columns">
        <section class="panel">
          <div class="panel-head"><div><p class="eyebrow">CONNECTION</p><h3>Provider status</h3></div><button class="primary" id="safelinku-test">Test connection</button></div>
          <div class="service"><span><i class="dot"></i>API configuration</span><b class="${configured ? '' : 'warn'}">${configured ? 'Ready' : 'Incomplete'}</b></div>
          <div class="service"><span><i class="dot"></i>API key</span><b>${status.api_key_configured ? 'Present' : 'Missing'}</b></div>
          <div class="service"><span><i class="dot"></i>Base URL</span><b>${status.base_url_configured ? 'Valid HTTPS' : 'Missing / invalid'}</b></div>
          <p class="chart-note" id="safelinku-result">No connection test has been requested in this session.</p>
        </section>
        <section class="panel">
          <div class="panel-head"><div><p class="eyebrow">TELEMETRY</p><h3>Recent provider activity</h3></div></div>
          ${last ? `<div class="activity"><span>${esc(last.status === 'success' ? 'Successful request' : 'Failed request')}<small>Request ID: ${esc(last.request_id)}</small></span><small>${esc(last.created_at)}</small></div>` : `<div class="empty"><b>No provider requests recorded</b><span>Connection activity will appear here after a test or integration request.</span></div>`}
        </section>
      </div>
      <section class="panel">
        <div class="panel-head"><div><p class="eyebrow">CLAIMS</p><h3>Claim integration</h3></div>${badge(false, 'Provider contract required')}</div>
        <p class="chart-note">The provider claim/checkpoint endpoint is not exposed by the current SafeLinkU integration contract. The dashboard will not fabricate or guess an endpoint. Once the official endpoint and request contract are supplied, this section can be connected without changing authentication or the existing security boundary.</p>
        <div class="feature-grid"><article class="feature" aria-disabled="true"><span class="feature-icon">↗</span><span><b>Claim endpoint</b><small>Not enabled until the official provider API contract is configured.</small></span><em>—</em></article><article class="feature" aria-disabled="true"><span class="feature-icon">✓</span><span><b>Duplicate protection</b><small>Keep provider-side claim handling disabled until the endpoint contract is known.</small></span><em>—</em></article></div>
      </section>`;

    document.querySelector('#safelinku-test')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const result = document.querySelector('#safelinku-result');
      button.disabled = true;
      button.textContent = 'Testing…';
      result.textContent = 'Testing the configured provider connection…';
      try {
        const data = await api('/api/v1/safelinku/test-connection', { method: 'POST', body: '{}' });
        result.textContent = data.status === 'ok'
          ? `Connection successful (HTTP ${data.http_status ?? 'OK'}). Request ID: ${data.request_id || 'recorded'}.`
          : `Connection test returned ${data.status || 'error'}${data.http_status ? ` (HTTP ${data.http_status})` : ''}.`;
      } catch (error) {
        result.textContent = `Connection test failed: ${error.message}`;
      } finally {
        button.disabled = false;
        button.textContent = 'Test connection';
      }
    });
  } catch (error) {
    root.innerHTML = `<section class="hero error"><div><p class="eyebrow">SAFE LINK U ERROR</p><h2>Unable to load integration status</h2><p>${esc(error.message)}</p></div><button class="primary" id="safelinku-retry">Retry</button></section>`;
    document.querySelector('#safelinku-retry')?.addEventListener('click', loadSafeLinkU);
  }
}

window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.safelinku = () => {
  const content = document.querySelector('#content');
  if (!content) return;
  content.innerHTML = '<div id="safelinku-root"></div>';
  loadSafeLinkU();
};
