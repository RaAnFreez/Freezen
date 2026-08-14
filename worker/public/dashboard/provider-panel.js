const esc = (value) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const META_KEY = 'frezen.safelinku.integration.meta';
const readMeta = () => { try { const v = JSON.parse(localStorage.getItem(META_KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const writeMeta = (v) => { try { localStorage.setItem(META_KEY, JSON.stringify(v)); } catch {} };
const generateSalt = () => { const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return Array.from(bytes, (b) => b.toString(16).padStart(2,'0')).join(''); };

function openProviderModal({ edit = false, meta = null }) {
  const wrap = document.createElement('div');
  wrap.className = 'provider-modal-backdrop';
  wrap.innerHTML = `<section class="provider-modal" role="dialog" aria-modal="true">
    <div class="provider-modal-head"><div><div class="provider-icon">⌁</div><h3>${edit ? 'Edit Provider' : 'New Provider'}</h3><p>${edit ? 'Modify provider settings' : 'Create and configure a provider'}</p></div><button class="provider-close" type="button">×</button></div>
    <form class="provider-form">
      <div class="provider-field"><label>Provider name <span class="provider-required">*</span></label><input id="provider-name" maxlength="80" required value="${esc(meta?.name || '')}" placeholder="SafeLinkU"></div>
      <div class="provider-field"><label>Provider type <span class="provider-required">*</span></label><select id="provider-type"><option value="safelinku" selected>SafeLinkU</option></select></div>
      <div class="provider-field"><label>SafeLinkU API Key <span class="provider-required">*</span></label><input id="provider-key" type="password" autocomplete="new-password" ${edit ? '' : 'required'} placeholder="${edit ? 'Leave blank to keep the current key' : 'Paste provider API key'}"></div>
      <div class="provider-field"><label>Salt <span class="provider-required">*</span></label><div style="display:grid;grid-template-columns:1fr auto;gap:10px"><input id="provider-salt" maxlength="128" required value="${esc(meta?.salt || '')}" placeholder="Generate a secure salt"><button class="secondary" id="provider-generate" type="button">Generate</button></div></div>
      <p class="provider-note">This phase is UI-only. The provider secret is never persisted in browser storage.</p>
      <div class="provider-actions-row"><button class="primary" type="submit">${edit ? 'Save' : 'Create'}</button><button class="secondary" type="button" id="provider-cancel">Cancel</button></div>
    </form></section>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('.provider-close').onclick = close;
  wrap.querySelector('#provider-cancel').onclick = close;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector('#provider-generate').onclick = () => { wrap.querySelector('#provider-salt').value = generateSalt(); };
  wrap.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const name = wrap.querySelector('#provider-name').value.trim();
    const salt = wrap.querySelector('#provider-salt').value.trim();
    const key = wrap.querySelector('#provider-key').value.trim();
    if (!name || !salt || (!edit && !key)) return;
    writeMeta({ name, salt, key_configured: Boolean(key) || Boolean(meta?.key_configured), updated_at: new Date().toISOString() });
    close(); renderProvider();
  };
}

function renderProvider() {
  const root = document.querySelector('#content'); if (!root) return;
  const meta = readMeta();
  const configured = Boolean(meta?.key_configured);
  root.innerHTML = `<div class="provider-page">
    <div class="provider-header"><div class="provider-icon">⌁</div><div><h2>Providers</h2><p>Connect and manage providers used by Frezen services.</p></div></div>
    <button class="primary provider-new" id="provider-new">＋&nbsp; New Provider</button>
    <select class="provider-sort" aria-label="Provider sorting"><option selected>Name ↑</option><option>Name ↓</option><option>Status</option></select>
    ${meta ? `<article class="provider-card"><div class="provider-card-head"><div class="provider-logo">S</div><div><h3>${esc(meta.name)}</h3><div class="provider-type">SafeLinkU</div></div></div><div class="provider-badges"><span class="provider-badge ${configured ? '' : 'pending'}"><span class="dot"></span>${configured ? 'Active' : 'Pending'}</span><span class="provider-badge"><span class="dot">✓</span>Flow-Ready</span></div><div class="provider-actions"><button class="primary edit" id="provider-edit">✎&nbsp; Edit</button><button class="secondary more" id="provider-more">•••</button></div></article>` : `<div class="provider-empty"><b>No providers available yet</b>Create your first provider to connect SafeLinkU.</div>`}
  </div>`;
  document.querySelector('#provider-new')?.addEventListener('click', () => openProviderModal({}));
  document.querySelector('#provider-edit')?.addEventListener('click', () => openProviderModal({ edit: true, meta }));
  document.querySelector('#provider-more')?.addEventListener('click', () => alert('Additional provider actions will be added only when requested.'));
}

window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.provider = renderProvider;