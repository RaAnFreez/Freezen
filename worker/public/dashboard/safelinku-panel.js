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

const META_KEY = 'frezen.safelinku.integration.meta';

function readMeta() {
  try {
    const value = JSON.parse(localStorage.getItem(META_KEY) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function writeMeta(meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // UI metadata only. The provider API key is never stored here.
  }
}

function generateSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function openIntegrationModal({ edit = false, meta = null, configured = false }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'safelinku-modal-backdrop';
  backdrop.innerHTML = `
    <section class="safelinku-modal" role="dialog" aria-modal="true" aria-labelledby="safelinku-modal-title">
      <div class="safelinku-modal-head">
        <div>
          <div class="safelinku-brand-icon">⌁</div>
          <h3 id="safelinku-modal-title">${edit ? 'Edit integration' : 'New Integration'}</h3>
          <p>${edit ? 'Update integration settings' : 'Connect new integration service'}</p>
        </div>
        <button class="safelinku-modal-close" type="button" aria-label="Close">×</button>
      </div>
      <form class="safelinku-form">
        <div class="safelinku-field">
          <label class="safelinku-label" for="safelinku-name">Name <span class="safelinku-required">*</span></label>
          <input class="safelinku-input" id="safelinku-name" maxlength="80" required value="${esc(meta?.name || '')}" placeholder="Getkey system">
        </div>
        <div class="safelinku-field">
          <label class="safelinku-label" for="safelinku-key">SafeLinkU API Key <span class="safelinku-required">*</span></label>
          <input class="safelinku-input" id="safelinku-key" type="password" autocomplete="new-password" ${edit ? '' : 'required'} placeholder="${edit ? 'Leave blank to keep current key' : 'Paste your SafeLinkU API key'}">
        </div>
        <div class="safelinku-field">
          <label class="safelinku-label" for="safelinku-salt">Salt <span class="safelinku-required">*</span></label>
          <div class="safelinku-salt-row">
            <input class="safelinku-input" id="safelinku-salt" maxlength="128" required value="${esc(meta?.salt || '')}" placeholder="Generate a secure salt">
            <button class="secondary safelinku-generate" id="safelinku-generate" type="button">Generate</button>
          </div>
        </div>
        <p class="safelinku-note">The API key is never written to browser storage. Provider credentials remain controlled by the Worker-side configuration.</p>
        <div class="safelinku-form-actions">
          <button class="primary" type="submit">${edit ? 'Update' : 'Create'}</button>
          <button class="secondary" type="button" id="safelinku-cancel">Cancel</button>
        </div>
      </form>
    </section>`;

  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector('.safelinku-modal-close').onclick = close;
  backdrop.querySelector('#safelinku-cancel').onclick = close;
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelector('#safelinku-generate').onclick = () => {
    backdrop.querySelector('#safelinku-salt').value = generateSalt();
  };

  backdrop.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = backdrop.querySelector('#safelinku-name').value.trim();
    const apiKey = backdrop.querySelector('#safelinku-key').value.trim();
    const salt = backdrop.querySelector('#safelinku-salt').value.trim();
    if (!name || !salt || (!edit && !apiKey)) return;

    writeMeta({
      name,
      salt,
      key_configured: Boolean(apiKey) || Boolean(meta?.key_configured) || configured,
      updated_at: new Date().toISOString(),
    });
    close();
    mountSafeLinkU();
  });
}

async function mountSafeLinkU() {
  const root = document.querySelector('#safelinku-root');
  if (!root) return;
  root.innerHTML = '<div class="safelinku-loading"><div><div class="spinner"></div><b>Loading SafeLinkU integrations…</b></div></div>';

  try {
    const status = await api('/api/v1/safelinku/status');
    const meta = readMeta();
    const configured = Boolean(status.configured);
    const current = meta || (configured ? { name: 'Getkey system', salt: '', key_configured: true } : null);

    root.innerHTML = `
      <div class="safelinku-page">
        <section class="safelinku-hero">
          <div class="safelinku-brand">
            <div class="safelinku-brand-icon">⌁</div>
            <div>
              <h2>Integrations</h2>
              <p>Connect and manage your SafeLinkU provider.</p>
            </div>
          </div>
        </section>

        <button class="primary safelinku-new" id="safelinku-new">＋ <span>New Integration</span></button>

        <div class="safelinku-filters">
          <select class="safelinku-select" aria-label="Integration type"><option selected>SafeLinkU</option></select>
          <select class="safelinku-select" aria-label="Integration status"><option selected>All</option><option>Active</option><option>Pending</option></select>
        </div>

        <details class="safelinku-program">
          <summary>✨ Partner Programs</summary>
          <div class="safelinku-program-copy">SafeLinkU is the selected provider for the current Frezen get-key flow.</div>
        </details>

        ${current ? `
          <article class="safelinku-card">
            <div class="safelinku-card-head">
              <div class="safelinku-provider-logo">S</div>
              <div>
                <h3>${esc(current.name)}</h3>
                <div class="safelinku-provider">Safelinku</div>
              </div>
            </div>
            <div class="safelinku-badges">
              <span class="safelinku-badge ${configured ? '' : 'pending'}"><span class="safelinku-badge-dot"></span>${configured ? 'Active' : 'Pending'}</span>
              <span class="safelinku-badge"><span class="safelinku-badge-dot">✓</span>Flow-Ready</span>
            </div>
            <div class="safelinku-actions">
              <button class="primary safelinku-edit" id="safelinku-edit">✎ <span>Edit</span></button>
              <button class="secondary safelinku-more" id="safelinku-more" aria-label="More options">•••</button>
            </div>
          </article>` : `
          <div class="safelinku-empty"><b>No SafeLinkU integration yet</b><span>Tap “New Integration” to create one.</span></div>`}
      </div>`;

    document.querySelector('#safelinku-new')?.addEventListener('click', () => openIntegrationModal({ configured }));
    document.querySelector('#safelinku-edit')?.addEventListener('click', () => openIntegrationModal({ edit: true, meta: current, configured }));
    document.querySelector('#safelinku-more')?.addEventListener('click', () => {
      const card = document.querySelector('.safelinku-card');
      if (!card) return;
      const existing = card.querySelector('.safelinku-status');
      if (existing) return existing.remove();
      const info = document.createElement('div');
      info.className = 'safelinku-status';
      info.textContent = 'More integration actions can be added later when requested.';
      card.appendChild(info);
    });
  } catch (error) {
    root.innerHTML = `<section class="hero error"><div><p class="eyebrow">SAFE LINK U ERROR</p><h2>Unable to load integrations</h2><p>${esc(error.message)}</p></div><button class="primary" id="safelinku-retry">Retry</button></section>`;
    document.querySelector('#safelinku-retry')?.addEventListener('click', mountSafeLinkU);
  }
}

window.FrezenDashboardPanels = window.FrezenDashboardPanels || {};
window.FrezenDashboardPanels.safelinku = () => {
  const content = document.querySelector('#content');
  if (!content) return;
  content.innerHTML = '<div id="safelinku-root"></div>';
  mountSafeLinkU();
};
