(() => {
  const state = {
    scripts: new Map(),
    deliveries: new Map(),
    lastDeliveryId: '',
    scanning: false,
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const originalFetch = window.fetch.bind(window);

  const css = document.createElement('style');
  css.textContent = `
    .frezen-source-editor-backdrop{position:fixed;inset:0;z-index:4600;background:rgba(0,0,0,.78);backdrop-filter:blur(12px);display:flex;align-items:flex-end;justify-content:center;padding:10px}
    .frezen-source-editor{width:min(100%,1100px);height:min(94vh,920px);display:flex;flex-direction:column;background:#120e17;border:1px solid rgba(255,255,255,.08);border-radius:18px;box-shadow:0 30px 120px rgba(0,0,0,.6);overflow:hidden}
    .frezen-source-head{display:flex;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.06)}
    .frezen-source-head h3{margin:0;font-size:18px}.frezen-source-head p{margin:4px 0 0;color:#8f99aa;font-size:11px}
    .frezen-source-head button{border:0;background:transparent;color:#b6bfca;font-size:24px}
    .frezen-source-tabs{display:flex;gap:8px;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.05)}
    .frezen-source-tab{border:0;border-radius:999px;padding:9px 13px;background:#1a1520;color:#aeb7c4;font:inherit;font-weight:700}.frezen-source-tab.active{background:#a85cff;color:#fff}
    .frezen-source-meta{display:flex;gap:7px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid rgba(255,255,255,.05)}
    .frezen-source-pill{padding:5px 8px;border-radius:999px;background:#17131d;color:#adb7c4;font-size:10px}.frezen-source-pill.ok{background:#102318;color:#7fe8a6}
    .frezen-source-editor textarea{flex:1;width:100%;border:0;resize:none;padding:16px;background:#0b0a0f;color:#e6eaf0;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;outline:none}
    .frezen-source-editor textarea[readonly]{color:#b9c2ce}
    .frezen-source-note{padding:10px 18px;color:#8c96a5;font-size:11px;border-top:1px solid rgba(255,255,255,.05)}
    .frezen-source-foot{display:flex;gap:8px;padding:12px 18px;border-top:1px solid rgba(255,255,255,.06)}
    .frezen-source-foot button{flex:1;min-height:44px;border:0;border-radius:10px;background:#211927;color:#e1e7ef;font:inherit;font-weight:700}
    .frezen-source-foot .primary{background:#a85cff;color:#fff}.frezen-source-foot .danger{color:#ff9aaa}
    @media(min-width:700px){.frezen-source-editor-backdrop{align-items:center}.frezen-source-editor{border-radius:18px}}
  `;
  document.head.appendChild(css);

  async function api(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('accept', 'application/json');
    if (!(options.body instanceof FormData)) headers.set('content-type', 'application/json');
    const response = await originalFetch(url, { credentials: 'same-origin', ...options, headers });
    if (response.status === 401 || response.status === 403) { location.href = '/login'; return null; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  }

  function remember(type, data) {
    if (!data) return;
    if (type === 'scripts' && data.script?.id) state.scripts.set(String(data.script.id), data);
    if (type === 'delivery' && data.script?.id) {
      state.deliveries.set(String(data.script.id), data);
      state.lastDeliveryId = String(data.script.id);
    }
  }

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const requestUrl = typeof args[0] === 'string' ? args[0] : String(args[0]?.url || '');
      const parsed = new URL(requestUrl, location.href);
      if (response.ok && !parsed.search) {
        const scriptMatch = parsed.pathname.match(/^\/api\/v1\/scripts\/([^/]+)$/);
        const deliveryMatch = parsed.pathname.match(/^\/api\/v1\/script-delivery\/([^/]+)$/);
        if (scriptMatch || deliveryMatch) {
          const clone = response.clone();
          const data = await clone.json().catch(() => null);
          if (data?.script?.id) remember(scriptMatch ? 'scripts' : 'delivery', data);
        }
      }
    } catch {}
    setTimeout(scan, 0);
    return response;
  };

  function addButton(actions, className, text, onClick, key) {
    if (!actions || actions.querySelector(`[data-frezen-editor="${key}"]`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.frezenEditor = key;
    button.textContent = text;
    button.addEventListener('click', onClick);
    actions.appendChild(button);
  }

  function scan() {
    if (state.scanning) return;
    state.scanning = true;
    try {
      document.querySelectorAll('.lua-modal .lua-card').forEach((card) => {
        const versionNode = card.querySelector('.lua-card-head b');
        const scriptId = String(card.closest('.lua-modal')?.dataset.frezenScriptId || '');
        if (!versionNode || !scriptId) return;
        const version = versionNode.textContent.trim();
        const meta = state.scripts.get(scriptId)?.versions?.find((item) => String(item.version) === version);
        if (!meta?.id) return;
        const actions = card.querySelector('.lua-actions');
        addButton(actions, 'lua-btn', 'Edit Source', () => openEditor('scripts', scriptId, meta.id), `lua-edit-${meta.id}`);
        addButton(actions, 'lua-btn', 'Delete Version', () => deleteVersion('scripts', scriptId, meta.id, version), `lua-delete-${meta.id}`);
      });

      const deliveryId = state.lastDeliveryId;
      if (deliveryId) document.querySelectorAll('.delivery-version').forEach((row) => {
        const versionNode = row.querySelector('b');
        if (!versionNode) return;
        const version = versionNode.textContent.trim();
        const meta = state.deliveries.get(deliveryId)?.versions?.find((item) => String(item.version) === version);
        if (!meta?.id) return;
        const actions = row.lastElementChild;
        addButton(actions, 'delivery-btn', 'Edit Source', () => openEditor('delivery', deliveryId, meta.id), `delivery-edit-${meta.id}`);
        addButton(actions, 'delivery-btn', 'Delete', () => deleteVersion('delivery', deliveryId, meta.id, version), `delivery-delete-${meta.id}`);
      });
    } finally {
      state.scanning = false;
    }
  }

  function mountObserver() {
    // Details modals are mounted directly under <body>, not inside #content.
    // Observe the full document so version action buttons are injected reliably
    // after the dashboard panel creates its modal.
    const observer = new MutationObserver(() => setTimeout(scan, 0));
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
  }

  function modal(title, subtitle) {
    const bg = document.createElement('div');
    bg.className = 'frezen-source-editor-backdrop';
    bg.innerHTML = `<section class="frezen-source-editor">
      <header class="frezen-source-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div><button type="button" data-close>×</button></header>
      <div class="frezen-source-tabs"><button type="button" class="frezen-source-tab active" data-tab="source">Original Source</button><button type="button" class="frezen-source-tab" data-tab="obfuscated">Obfuscated Result</button></div>
      <div class="frezen-source-meta" data-meta></div>
      <textarea data-source spellcheck="false"></textarea>
      <textarea data-obfuscated spellcheck="false" readonly hidden></textarea>
      <div class="frezen-source-note">Save always regenerates the obfuscated payload from the Original Source and keeps the same version number. The generated obfuscated result is read-only in this editor.</div>
      <footer class="frezen-source-foot"><button type="button" data-close>Cancel</button><button type="button" class="danger" data-delete>Delete Version</button><button type="button" class="primary" data-save>Save & Re-obfuscate</button></footer>
    </section>`;
    document.body.appendChild(bg);
    return bg;
  }

  async function openEditor(type, scriptId, versionId) {
    try {
      const endpoint = type === 'scripts'
        ? `/api/v1/scripts/${encodeURIComponent(scriptId)}?view=editor&version_id=${encodeURIComponent(versionId)}`
        : `/api/v1/script-delivery/${encodeURIComponent(scriptId)}?view=editor&version_id=${encodeURIComponent(versionId)}`;
      const data = await api(endpoint);
      if (!data) return;
      remember(type, data);
      const version = data.version || {};
      const bg = modal(type === 'scripts' ? 'Lua Script Editor' : 'Script Delivery Editor', `${version.version || 'Version'} · original + generated obfuscation`);
      const source = bg.querySelector('[data-source]');
      const obfuscated = bg.querySelector('[data-obfuscated]');
      const meta = bg.querySelector('[data-meta]');
      source.value = data.source?.content || '';
      obfuscated.value = data.payload?.content || '';
      meta.innerHTML = `<span class="frezen-source-pill">${esc(version.version || 'unknown version')}</span><span class="frezen-source-pill">${esc(data.source?.size_bytes || 0)} B source</span><span class="frezen-source-pill">${esc(data.payload?.size_bytes || 0)} B output</span><span class="frezen-source-pill ok">${data.payload?.obfuscation_verified ? 'Advanced v1.1 · Very High · 100%' : 'Legacy payload · save to regenerate'}</span>`;
      if (!data.source?.available) {
        source.value = '';
        source.placeholder = 'Original source is unavailable for this version. Saving will not proceed until source is provided.';
      }

      const tabs = bg.querySelectorAll('[data-tab]');
      tabs.forEach((tab) => tab.addEventListener('click', () => {
        tabs.forEach((item) => item.classList.toggle('active', item === tab));
        const isSource = tab.dataset.tab === 'source';
        source.hidden = !isSource;
        obfuscated.hidden = isSource;
      }));
      const close = () => bg.remove();
      bg.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', close));

      bg.querySelector('[data-save]').onclick = async () => {
        if (!source.value.trim()) return alert('Original source is required.');
        const button = bg.querySelector('[data-save]');
        button.disabled = true; button.textContent = 'Obfuscating…';
        try {
          const endpoint = type === 'scripts'
            ? `/api/v1/scripts/${encodeURIComponent(scriptId)}/versions/${encodeURIComponent(versionId)}`
            : `/api/v1/script-delivery/${encodeURIComponent(scriptId)}/versions/${encodeURIComponent(versionId)}`;
          await api(endpoint, { method: 'PATCH', body: JSON.stringify({ source: source.value }) });
          close();
          refreshPanel(type);
        } catch (error) {
          alert(`Save failed: ${error.message}`);
          button.disabled = false; button.textContent = 'Save & Re-obfuscate';
        }
      };

      bg.querySelector('[data-delete]').onclick = async () => {
        await deleteVersion(type, scriptId, versionId, version.version, bg);
      };
    } catch (error) {
      alert(`Editor failed: ${error.message}`);
    }
  }

  async function deleteVersion(type, scriptId, versionId, version, bg = null) {
    if (!confirm(`Delete version ${version || versionId}? This permanently removes its stored source and obfuscated payload.`)) return;
    try {
      const endpoint = type === 'scripts'
        ? `/api/v1/scripts/${encodeURIComponent(scriptId)}/versions/${encodeURIComponent(versionId)}`
        : `/api/v1/script-delivery/${encodeURIComponent(scriptId)}/versions/${encodeURIComponent(versionId)}`;
      await api(endpoint, { method: 'DELETE' });
      if (bg) bg.remove();
      refreshPanel(type);
    } catch (error) {
      alert(`Delete failed: ${error.message}`);
    }
  }

  function refreshPanel(type) {
    const panel = type === 'scripts' ? 'scripts' : 'script-delivery';
    const mount = window.FrezenDashboardPanels?.[panel];
    if (typeof mount === 'function') mount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountObserver);
  else mountObserver();
})();
