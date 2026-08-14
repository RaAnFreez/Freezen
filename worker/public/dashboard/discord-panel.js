const esc = (value) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function badge(value, ok = false) {
  return `<span class="badge ${ok ? '' : 'warn'}"><span class="dot"></span>${esc(value)}</span>`;
}

function card(label, value, note, ok = false) {
  return `<article class="stat"><div class="stat-icon">◉</div><p>${esc(label)}</p><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
}

async function loadDiscordPanel() {
  const content = document.querySelector('#content');
  content.innerHTML = `<section class="panel loading"><div class="spinner"></div><b>Loading Discord integration…</b><span>Reading protected server-side configuration.</span></section>`;
  try {
    const response = await fetch('/api/v1/discord/status', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (response.status === 401 || response.status === 403) { location.href = '/login'; return; }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const configured = Boolean(data.configured);
    content.innerHTML = `
      <div class="hero">
        <div><p class="eyebrow">DISCORD INTEGRATION</p><h2>Discord Control Center</h2><p>Manage the secure connection between Frezen, your Discord guild and buyer-role workflow.</p></div>
        ${badge(configured ? 'Configured' : 'Needs configuration', configured)}
      </div>
      <div class="stats">
        ${card('Bot credentials', data.bot === 'configured' ? 'Ready' : 'Missing', 'Secret values are never displayed', data.bot === 'configured')}
        ${card('Guild', data.guild === 'configured' ? 'Configured' : 'Missing', 'Guild ID remains server-side', data.guild === 'configured')}
        ${card('Buyer role', data.buyer_role === 'configured' ? 'Configured' : 'Missing', 'Role ID remains server-side', data.buyer_role === 'configured')}
        ${card('Connection', data.connection || 'Not tested', 'Live Discord connection is a later integration step', false)}
      </div>
      <div class="columns">
        <section class="panel">
          <div class="panel-head"><div><p class="eyebrow">CONFIGURATION</p><h3>Protected settings</h3></div>${badge(configured ? 'Server ready' : 'Incomplete', configured)}</div>
          <div class="service"><span><i class="dot"></i>Bot token</span><b>${esc(data.bot_token_configured ? 'Configured' : 'Missing')}</b></div>
          <div class="service"><span><i class="dot"></i>Bot secret</span><b>${esc(data.bot_secret_configured ? 'Configured' : 'Missing')}</b></div>
          <div class="service"><span><i class="dot"></i>Client ID</span><b>${esc(data.client_id_configured ? 'Configured' : 'Missing')}</b></div>
          <div class="service"><span><i class="dot"></i>Guild ID</span><b>${esc(data.guild_id_configured ? 'Configured' : 'Missing')}</b></div>
          <div class="service"><span><i class="dot"></i>Buyer role ID</span><b>${esc(data.buyer_role_configured ? 'Configured' : 'Missing')}</b></div>
        </section>
        <section class="panel">
          <div class="panel-head"><div><p class="eyebrow">WORKFLOW</p><h3>Discord lifecycle</h3></div></div>
          <div class="activity"><span>Guild verification<small>Verify configured guild before linking users.</small></span><small>Ready</small></div>
          <div class="activity"><span>Buyer role<small>Use server-side role configuration for authorization.</small></span><small>${esc(data.buyer_role_configured ? 'Configured' : 'Pending')}</small></div>
          <div class="activity"><span>License linking<small>Link Discord identity to an authorized Frezen account.</small></span><small>Next</small></div>
          <div class="activity"><span>Commands / events<small>Bot runtime and event handlers remain separate from Worker secrets.</small></span><small>Next</small></div>
        </section>
      </div>
      <section class="panel">
        <div class="panel-head"><div><p class="eyebrow">SECURITY</p><h3>Integration boundary</h3></div>${badge('Protected', true)}</div>
        <div class="empty"><b>No Discord secrets are exposed in this dashboard.</b><span>The panel only receives boolean configuration state and safe status metadata from the authenticated API.</span></div>
      </section>`;
  } catch (error) {
    content.innerHTML = `<section class="hero error"><div><p class="eyebrow">DISCORD ERROR</p><h2>Unable to load integration status</h2><p>${esc(error.message)}</p></div><button class="primary" id="discord-retry">Retry</button></section>`;
    document.querySelector('#discord-retry').onclick = loadDiscordPanel;
  }
}

window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.discord = loadDiscordPanel;
