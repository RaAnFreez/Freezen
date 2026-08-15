const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const KEY = 'frezen.services.v1';
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
const id = () => crypto.randomUUID();
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9-_]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50);
const keyUrl = (slug) => `${location.origin}/get-key/${encodeURIComponent(slug)}`;

function modal({ edit = false, service = null }) {
  const wrap = document.createElement('div');
  wrap.className = 'service-modal-backdrop';
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  wrap.innerHTML = `<section class="service-modal" role="dialog" aria-modal="true"><div class="service-modal-head"><div><div class="service-icon">▦</div><h3>${edit ? 'Edit Service' : 'New Service'}</h3><p>${edit ? 'Modify service settings' : 'Create and configure a new service'}</p></div><button class="service-close" type="button">×</button></div><form class="service-form"><label>Name <span>*</span><input id="service-name" maxlength="100" required value="${esc(service?.name || '')}" placeholder="Frezen Gui"></label><label>Description<input id="service-description" maxlength="500" value="${esc(service?.description || '')}" placeholder="Optional service description"></label><label>Configured Link<input id="service-link" maxlength="200" readonly value="${esc(service?.configured_link || (service?.slug ? keyUrl(service.slug) : ''))}" placeholder="https://example.com/get-key/frezen"><small>The public key link belongs to this Service.</small></label><label>Service Slug<input id="service-slug" maxlength="50" pattern="[A-Za-z0-9_-]{3,50}" required value="${esc(service?.slug || '')}" placeholder="frezen"><small>Example: <b>/get-key/frezen</b></small></label><div class="service-option"><div><b>Premium Service</b><small>Mark this service as premium.</small></div><input id="service-premium" type="checkbox" ${service?.premium ? 'checked' : ''}></div><div class="service-option"><div><b>Keyless Mode</b><small>Skip key verification for this service.</small></div><input id="service-keyless" type="checkbox" ${service?.keyless ? 'checked' : ''}></div><div class="service-days"><b>Keyless weekdays</b><small>Automatically keyless on selected weekdays (UTC).</small><div class="day-grid">${days.map((d,i)=>`<label><span>${d}</span><input class="service-day" type="checkbox" data-day="${i}" ${service?.days?.includes(i) ? 'checked' : ''}></label>`).join('')}</div></div><p class="service-note">Provider configuration remains separate. This Service owns the configured public key link.</p><div class="service-form-actions"><button class="primary" type="submit">${edit ? 'Save' : 'Create'}</button><button class="secondary" type="button" id="service-cancel">Cancel</button></div></form></section>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  const slugInput = wrap.querySelector('#service-slug');
  const linkInput = wrap.querySelector('#service-link');
  const updateUrl = () => { linkInput.value = slugify(slugInput.value) ? keyUrl(slugify(slugInput.value)) : ''; };
  slugInput.addEventListener('input', updateUrl);
  wrap.querySelector('.service-close').onclick = close;
  wrap.querySelector('#service-cancel').onclick = close;
  wrap.onclick = (e) => { if (e.target === wrap) close(); };
  wrap.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const name = wrap.querySelector('#service-name').value.trim();
    const slug = slugify(slugInput.value);
    if (!name || slug.length < 3) return;
    const list = read();
    if (list.some(x => x.slug === slug && x.id !== service?.id)) { alert('This service slug is already in use.'); return; }
    const configured_link = keyUrl(slug);
    const item = { id: service?.id || id(), name, slug, configured_link, description: wrap.querySelector('#service-description').value.trim(), premium: wrap.querySelector('#service-premium').checked, keyless: wrap.querySelector('#service-keyless').checked, days: [...wrap.querySelectorAll('.service-day:checked')].map(x => Number(x.dataset.day)), updated_at: new Date().toISOString() };
    write(edit ? list.map(x => x.id === item.id ? item : x) : [item, ...list]);
    close(); renderServices();
  };
}

function renderServices() {
  const root = document.querySelector('#content'); if (!root) return;
  const services = read();
  root.innerHTML = `<div class="service-page"><div class="service-header"><div class="service-icon">▦</div><div><h2>Services</h2><p>Create and manage services and their configured key links.</p></div></div><button class="primary service-new" id="service-new">＋ <span>New Service</span></button><select class="service-sort"><option>Name ↑</option><option>Name ↓</option><option>Status</option></select>${services.length ? `<div class="service-count"><b>${services.length}</b><span>/ 10 Services</span><i></i></div><div class="service-list">${services.map(s => `<article class="service-card" data-id="${esc(s.id)}"><div class="service-card-head"><div class="service-card-icon">▦</div><div><h3>${esc(s.name)} ${s.premium ? '<span class="premium-tag">☆ Premium</span>' : ''}</h3><p>${esc(s.description || 'No description available')}</p></div></div><div class="service-configured-link"><small>Configured Link</small><div><code>${esc(s.configured_link || keyUrl(s.slug || 'your-slug'))}</code><button class="secondary service-copy" type="button">Copy</button></div></div><div class="service-badges"><span>${s.keyless ? 'Keyless enabled' : 'Key verification'}</span><span>${s.days?.length ? `${s.days.length} keyless day${s.days.length > 1 ? 's' : ''}` : 'No keyless weekdays'}</span></div><div class="service-actions"><button class="secondary service-configure" type="button">✎ <span>Configure Link</span></button><button class="secondary service-edit" type="button">Edit</button><button class="secondary service-more" type="button">•••</button></div></article>`).join('')}</div>` : `<div class="service-empty"><div class="service-empty-icon">▦</div><b>No services available yet</b><span>Create your first service and configure its public key link.</span><button class="primary" id="service-empty-new">＋ New Service</button></div>`}</div>`;
  root.querySelector('#service-new')?.addEventListener('click', () => modal({}));
  root.querySelector('#service-empty-new')?.addEventListener('click', () => modal({}));
  root.querySelectorAll('.service-configure,.service-edit').forEach(btn => btn.addEventListener('click', () => { const s = read().find(x => x.id === btn.closest('.service-card')?.dataset.id); if (s) modal({ edit: true, service: s }); }));
  root.querySelectorAll('.service-copy').forEach(btn => btn.addEventListener('click', async () => { const value = btn.closest('.service-configured-link')?.querySelector('code')?.textContent || ''; try { await navigator.clipboard.writeText(value); btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1200); } catch {} }));
  root.querySelectorAll('.service-more').forEach(btn => btn.addEventListener('click', () => { const card = btn.closest('.service-card'); const s = read().find(x => x.id === card?.dataset.id); if (!s) return; if (!confirm(`Delete service "${s.name}"?`)) return; write(read().filter(x => x.id !== s.id)); renderServices(); }));
}

window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.services = renderServices;
