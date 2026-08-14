const esc = (v) => String(v ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const severityClass = (value) => String(value || 'INFO').toUpperCase() === 'CRITICAL' ? 'warn' : '';

async function loadSecurity() {
  const root = document.querySelector('#content');
  root.innerHTML = `<section class="panel loading"><div class="spinner"></div><b>Loading Security Center…</b><span>Reading authenticated security events.</span></section>`;
  try {
    const response = await fetch('/api/v1/dashboard/overview?view=security', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (response.status === 401 || response.status === 403) { location.href = '/login'; return; }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const critical = events.filter((e) => String(e.severity).toUpperCase() === 'CRITICAL').length;
    const warning = events.filter((e) => String(e.severity).toUpperCase() === 'WARNING').length;
    root.innerHTML = `<section class="hero"><div><p class="eyebrow">SECURITY</p><h2>Security Center</h2><p>Security events, request correlation and authentication risk indicators.</p></div><span class="badge"><span class="dot"></span>${data.degraded ? 'Degraded' : 'Protected'}</span></section><div class="stats"><article class="stat"><div class="stat-icon">◆</div><p>Events</p><strong>${events.length}</strong><small>Recent security events</small></article><article class="stat"><div class="stat-icon">!</div><p>Warnings</p><strong>${warning}</strong><small>Elevated events</small></article><article class="stat"><div class="stat-icon">×</div><p>Critical</p><strong>${critical}</strong><small>Immediate attention</small></article></div><section class="panel"><div class="panel-head"><div><p class="eyebrow">SECURITY EVENTS</p><h3>Recent events</h3></div><button class="ghost" id="security-refresh">Refresh</button></div>${events.length ? events.map((e) => `<div class="activity"><span><b class="${severityClass(e.severity)}">${esc(e.event_type || 'SECURITY_EVENT')}</b><small>User: ${esc(e.user_id || 'system')} · Request: ${esc(e.request_id || '—')}</small></span><small>${esc(e.created_at || '')}</small></div>`).join('') : `<div class="empty"><b>No security events recorded</b><span>Failed authentication and other security-relevant events will appear here.</span></div>`}</section>`;
    document.querySelector('#security-refresh').onclick = loadSecurity;
  } catch (error) {
    root.innerHTML = `<section class="hero error"><div><p class="eyebrow">SECURITY ERROR</p><h2>Unable to load security events</h2><p>The authenticated security view returned ${esc(error.message)}.</p></div><button class="primary" id="security-retry">Retry</button></section>`;
    document.querySelector('#security-retry').onclick = loadSecurity;
  }
}

window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.security = loadSecurity;
