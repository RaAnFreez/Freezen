const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const PROVIDERS_KEY = 'frezen.providers.v1';
const SERVICES_KEY = 'frezen.services.v1';
const SAFE_KEY = 'frezen.safelinku.integration.meta';
const readJson = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const makeId = () => crypto.randomUUID();
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9-_]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50);
const keyUrl = (slug) => `${location.origin}/get-key/${encodeURIComponent(slug)}`;

function openProviderModal({ edit = false, provider = null }) {
  const services = readJson(SERVICES_KEY, []);
  const safeMeta = readJson(SAFE_KEY, null);
  const wrap = document.createElement('div');
  wrap.className = 'provider-modal-backdrop';
  wrap.innerHTML = `<section class="provider-modal" role="dialog" aria-modal="true"><div class="provider-modal-head"><div><div class="provider-icon">⌁</div><h3>${edit ? 'Edit Provider' : 'New Provider'}</h3><p>${edit ? 'Modify key-system provider settings' : 'Create a provider and generate a custom key link'}</p></div><button class="provider-close" type="button">×</button></div><form class="provider-form"><div class="provider-field"><label>Provider name <span class="provider-required">*</span></label><input id="provider-name" maxlength="100" required value="${esc(provider?.name || '')}" placeholder="Frezen Key System"></div><div class="provider-field"><label>Service <span class="provider-required">*</span></label><select id="provider-service" required><option value="">Select a service</option>${services.map(s => `<option value="${esc(s.id)}" ${provider?.service_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>${!services.length ? '<small class="provider-help">Create a Service first, then connect it here.</small>' : ''}</div><div class="provider-field"><label>Provider type</label><select id="provider-type"><option value="safelinku" selected>SafeLinkU</option></select></div><div class="provider-field"><label>Custom slug <span class="provider-required">*</span></label><input id="provider-slug" maxlength="50" pattern="[A-Za-z0-9_-]{3,50}" required value="${esc(provider?.slug || '')}" placeholder="frezen"><small class="provider-help">Only letters, numbers, hyphens and underscores.</small></div><div class="provider-link-preview"><span>Generated key link</span><code id="provider-url">${keyUrl(provider?.slug || 'your-slug')}</code><button type="button" class="secondary" id="provider-copy">Copy Link</button></div><div class="provider-connection ${safeMeta?.key_configured ? 'ready' : 'pending'}"><span class="provider-connection-dot"></span><div><b>SafeLinkU integration</b><small>${safeMeta?.key_configured ? 'Configured and available to this provider.' : 'Pending — configure SafeLinkU in its own tab first.'}</small></div></div><p class="provider-note">Provider is the key-link system. SafeLinkU credentials stay in the SafeLinkU tab; this panel only connects the provider to a service and key-link route.</p><div class="provider-actions-row"><button class="primary" type="submit" ${!services.length ? 'disabled' : ''}>${edit ? 'Save' : 'Create'}</button><button class="secondary" type="button" id="provider-cancel">Cancel</button></div></form></section>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  const slugInput = wrap.querySelector('#provider-slug');
  const url = wrap.querySelector('#provider-url');
  const updateUrl = () => { url.textContent = keyUrl(slugInput.value.trim() || 'your-slug'); };
  slugInput.addEventListener('input', updateUrl);
  wrap.querySelector('.provider-close').onclick = close;
  wrap.querySelector('#provider-cancel').onclick = close;
  wrap.onclick = (e) => { if (e.target === wrap) close(); };
  wrap.querySelector('#provider-copy').onclick = async () => { try { await navigator.clipboard.writeText(url.textContent); wrap.querySelector('#provider-copy').textContent = 'Copied'; setTimeout(() => wrap.querySelector('#provider-copy').textContent = 'Copy Link', 1200); } catch {} };
  wrap.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const name = wrap.querySelector('#provider-name').value.trim();
    const serviceId = wrap.querySelector('#provider-service').value;
    const slug = slugify(slugInput.value);
    if (!name || !serviceId || slug.length < 3) return;
    const list = readJson(PROVIDERS_KEY, []);
    if (list.some(x => x.slug === slug && x.id !== provider?.id)) { alert('This custom slug is already in use.'); return; }
    const item = { id: provider?.id || makeId(), name, service_id: serviceId, type: 'safelinku', slug, active: true, updated_at: new Date().toISOString() };
    writeJson(PROVIDERS_KEY, edit ? list.map(x => x.id === item.id ? item : x) : [item, ...list]);
    close(); renderProvider();
  };
}

function renderProvider() {
  const root = document.querySelector('#content'); if (!root) return;
  const providers = readJson(PROVIDERS_KEY, []);
  const services = readJson(SERVICES_KEY, []);
  const safeMeta = readJson(SAFE_KEY, null);
  root.innerHTML = `<div class="provider-page"><div class="provider-header"><div class="provider-icon">⌁</div><div><h2>Providers</h2><p>Key-system providers connect a Service + SafeLinkU to a custom public key link.</p></div></div><button class="primary provider-new" id="provider-new">＋ <span>New Provider</span></button><select class="provider-sort" aria-label="Provider sorting"><option>Name ↑</option><option>Name ↓</option><option>Status</option></select>${providers.length ? `<div class="provider-count"><b>${providers.length}</b><span>/ 10 Providers</span><i></i></div><div class="provider-list">${providers.map(p => { const service = services.find(s => s.id === p.service_id); const ready = Boolean(service && safeMeta?.key_configured && p.active); return `<article class="provider-card" data-id="${esc(p.id)}"><div class="provider-card-head"><div class="provider-logo">S</div><div><h3>${esc(p.name)}</h3><div class="provider-type">SafeLinkU · ${esc(service?.name || 'Service not selected')}</div></div></div><div class="provider-badges"><span class="provider-badge ${ready ? '' : 'pending'}"><span class="dot"></span>${ready ? 'Active' : 'Pending'}</span><span class="provider-badge"><span class="dot">✓</span>Key-Ready</span></div><div class="provider-link"><small>Custom key link</small><code>${esc(keyUrl(p.slug))}</code></div><div class="provider-actions"><button class="secondary configure" type="button">↗ <span>Configure Link</span></button><button class="secondary more" type="button">•••</button></div></article>`; }).join('')}</div>` : `<div class="provider-empty"><div class="provider-empty-icon">⌁</div><b>No providers available yet</b><span>Create a provider to connect a Service and SafeLinkU.</span><button class="primary" id="provider-empty-new">＋ New Provider</button></div>`}</div>`;
  root.querySelector('#provider-new')?.addEventListener('click', () => openProviderModal({}));
  root.querySelector('#provider-empty-new')?.addEventListener('click', () => openProviderModal({}));
  root.querySelectorAll('.configure').forEach(btn => btn.addEventListener('click', () => { const p = providers.find(x => x.id === btn.closest('.provider-card')?.dataset.id); if (p) openProviderModal({ edit: true, provider: p }); }));
  root.querySelectorAll('.more').forEach(btn => btn.addEventListener('click', () => { const p = providers.find(x => x.id === btn.closest('.provider-card')?.dataset.id); if (!p) return; if (!confirm(`Delete provider "${p.name}"?`)) return; writeJson(PROVIDERS_KEY, providers.filter(x => x.id !== p.id)); renderProvider(); }));
}

window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.provider = renderProvider;
