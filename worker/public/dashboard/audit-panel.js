const esc = (v) => String(v ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

async function loadAudit() {
  const root = document.querySelector('#content');
  root.innerHTML = `<section class="panel loading"><div class="spinner"></div><b>Loading Audit Logs…</b><span>Reading authenticated activity history.</span></section>`;
  try {
    const response = await fetch('/api/v1/dashboard/overview?view=audit', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (response.status === 401 || response.status === 403) { location.href = '/login'; return; }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];
    root.innerHTML = `<section class="hero"><div><p class="eyebrow">AUDIT</p><h2>Audit Log Center</h2><p>Authenticated activity from existing audit and license lifecycle records.</p></div><span class="badge"><span class="dot"></span>${data.degraded ? 'Degraded' : 'Live'}</span></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">ACTIVITY HISTORY</p><h3>${events.length} recent events</h3></div><button class="ghost" id="audit-refresh">Refresh</button></div>${events.length ? events.map((e) => `<div class="activity"><span><b>${esc(e.action || 'Activity')}</b><small>${esc(e.resource_type || e.source || 'Frezen')} ${esc(e.resource_id || '')}</small></span><small>${esc(e.created_at || '')}</small></div>`).join('') : `<div class="empty"><b>No audit events yet</b><span>New authenticated actions will appear here.</span></div>`}</section>`;
    document.querySelector('#audit-refresh').onclick = loadAudit;
  } catch (error) {
    root.innerHTML = `<section class="hero error"><div><p class="eyebrow">AUDIT ERROR</p><h2>Unable to load audit logs</h2><p>The authenticated audit view returned ${esc(error.message)}.</p></div><button class="primary" id="audit-retry">Retry</button></section>`;
    document.querySelector('#audit-retry').onclick = loadAudit;
  }
}

window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.audit = loadAudit;
