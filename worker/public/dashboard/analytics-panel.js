const esc = (v) => String(v ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const num = (v) => Number(v ?? 0).toLocaleString();

async function loadAnalytics(range = '30d') {
  const content = document.querySelector('#content');
  if (!content) return;
  content.innerHTML = `<section class="panel loading"><div class="spinner"></div><b>Loading analytics…</b><span>Reading authenticated production metrics.</span></section>`;
  try {
    const response = await fetch(`/api/v1/dashboard/overview?range=${encodeURIComponent(range)}&view=analytics`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (response.status === 401 || response.status === 403) { location.href = '/login'; return; }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderAnalytics(content, await response.json(), range);
  } catch (error) {
    content.innerHTML = `<section class="hero error"><div><p class="eyebrow">ANALYTICS ERROR</p><h2>Unable to load analytics</h2><p>The authenticated analytics API returned ${esc(error.message)}.</p></div><button class="primary" id="analytics-retry">Retry</button></section>`;
    document.querySelector('#analytics-retry')?.addEventListener('click', () => loadAnalytics(range));
  }
}

function metric(label, value, note, glyph) { return `<article class="stat"><div class="stat-icon">${glyph}</div><p>${esc(label)}</p><strong>${num(value)}</strong><small>${esc(note)}</small></article>`; }

function renderAnalytics(content, data, range) {
  const m = data?.metrics || {};
  const licenseSeries = Array.isArray(data?.charts?.license_activity) ? data.charts.license_activity : [];
  const scriptSeries = Array.isArray(data?.charts?.script_requests) ? data.charts.script_requests : [];
  const activity = Array.isArray(data?.recent_activity) ? data.recent_activity : [];
  const max = Math.max(1, ...[...licenseSeries, ...scriptSeries].map((x) => Number(x.count || 0)));
  const bars = licenseSeries.length ? licenseSeries.map((x) => `<i title="${esc(x.date)}: ${num(x.count)}" style="height:${Math.max(8, Math.round(Number(x.count || 0) / max * 100))}%"></i>`).join('') : '<div class="empty"><b>No license activity</b><span>No events were recorded for this range.</span></div>';
  const recent = activity.length ? activity.slice(0, 8).map((a) => `<div class="activity"><span>${esc(a.action || 'Activity')}<small>${esc(a.resource_type || a.resource_id || 'Frezen')}</small></span><small>${esc(a.created_at || '')}</small></div>`).join('') : '<div class="empty"><b>No recent activity</b><span>Audit events will appear here as they are recorded.</span></div>';
  content.innerHTML = `<div class="hero"><div><p class="eyebrow">PHASE 12 · ANALYTICS</p><h2>Frezen Analytics Center</h2><p>Authenticated operational metrics from the existing dashboard API. No fabricated values are used.</p></div><span class="badge"><span class="dot"></span>Live API</span></div><div class="tabs" style="margin:16px 0">${['24h','7d','30d','90d'].map((r) => `<button class="${r === range ? 'active' : ''}" data-analytics-range="${r}">${r.toUpperCase()}</button>`).join('')}</div><div class="stats">${metric('Total Licenses', m.total_licenses, 'All license records', '◇')}${metric('Active Licenses', m.active_licenses, 'Currently valid', '✓')}${metric('Users', m.users, 'Active accounts', '♙')}${metric('Script Requests', m.script_requests, `Within ${range}`, '{}')}${metric('SafeLinkU Claims', m.safelinku_claims, `Successful · ${range}`, '↗')}${metric('HWID Resets', m.hwid_resets, `Within ${range}`, '⌘')}${metric('Expired', m.expired_licenses, 'Past expiration', '◷')}${metric('Revoked', m.revoked_licenses, 'Revoked licenses', '⊘')}</div><div class="columns"><section class="panel"><div class="panel-head"><div><p class="eyebrow">LICENSE ACTIVITY</p><h3>Daily activity</h3></div><span class="eyebrow">${esc(range)}</span></div><div class="chart">${bars}</div><p class="chart-note">Authenticated license activity for the selected range.</p></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">SCRIPT DELIVERY</p><h3>Request activity</h3></div></div>${scriptSeries.length ? scriptSeries.slice(-8).map((x) => `<div class="activity"><span>${esc(x.date)}<small>Authorized script requests</small></span><b>${num(x.count)}</b></div>`).join('') : '<div class="empty"><b>No script requests</b><span>No script request events were recorded for this range.</span></div>'}</section></div><section class="panel recent-panel"><div class="panel-head"><div><p class="eyebrow">AUDIT STREAM</p><h3>Recent activity</h3></div><button class="ghost" data-section="audit">View logs</button></div>${recent}</section><section class="panel"><div class="panel-head"><div><p class="eyebrow">DATA SOURCE</p><h3>Production telemetry</h3></div></div><div class="service"><span><i class="dot"></i>Authenticated API</span><b>Connected</b></div><div class="service"><span><i class="dot"></i>Database</span><b>${esc(data?.database || 'Production D1')}</b></div><div class="service"><span><i class="dot"></i>Environment</span><b>${esc(data?.environment || 'production')}</b></div></section>`;
  document.querySelectorAll('[data-analytics-range]').forEach((button) => button.addEventListener('click', () => loadAnalytics(button.dataset.analyticsRange)));
}

window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.analytics = () => loadAnalytics('30d');
