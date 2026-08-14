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
    // UI metadata is optional; the provider secret is never stored here.
  }
}

function generateSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function styles() {
  return `<style>
    .integration-page{display:flex;flex-direction:column;gap:18px}
    .integration-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}
    .integration-heading h2{margin:0;font-size:22px}
    .integration-heading p{margin:4px 0 0;color:var(--muted,#9299a8);font-size:13px}
    .integration-icon{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:#291b37;border:1px solid #563c6f;color:#b56cff;font-size:24px}
    .heading-copy{display:flex;align-items:center;gap:12px}
    .new-integration{width:100%;justify-content:center}
    .integration-filters{display:grid;grid-template-columns:1fr;gap:10px}
    .integration-select{width:100%;padding:13px 14px;border-radius:11px;border:1px solid #292331;background:#120d17;color:#f4eef8;font:inherit}
    .programs{border:1px solid #292331;background:#120d17;border-radius:11px;overflow:hidden}
    .programs summary{cursor:pointer;list-style:none;padding:13px 15px;font-weight:700}
    .programs summary::-webkit-details-marker{display:none}
    .programs summary:after{content:'⌄';float:right;color:#a8a0ad}
    .programs .program-copy{padding:0 15px 14px;color:#85808b;font-size:12px}
    .integration-card{border:1px solid #2b2233;background:#120d17;border-radius:17px;padding:18px;box-shadow:0 12px 35px rgba(0,0,0,.16)}
    .integration-card-head{display:flex;align-items:flex-start;gap:12px}
    .provider-logo{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:#17182b;border:1px solid #34345b;color:#6b8cff;font-weight:900;font-size:22px}
    .integration-card h3{margin:2px 0 4px;font-size:18px}
    .integration-card .provider{color:#aaa2b0;font-size:13px}
    .badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
    .integration-badge{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:700;background:#17231e;border:1px solid #234e38;color:#55d890}
    .integration-badge .dot{width:7px;height:7px;border-radius:50%;background:currentColor}
    .integration-badge.pending{background:#282116;border-color:#57431d;color:#e2b85f}
    .integration-actions{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:18px}
    .integration-actions .edit-button{width:100%;justify-content:center}
    .more-button{width:54px}
    .empty-integration{padding:28px 16px;text-align:center;border:1px dashed #332a3a;border-radius:16px;color:#8d8793}
    .empty-integration b{display:block;color:#eee7f2;margin-bottom:5px}
    .modal-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.7);backdrop-filter:blur(5px);display:grid;place-items:center;padding:16px}
    .integration-modal{width:min(100%,640px);max-height:calc(100vh - 32px);overflow:auto;border:1px solid #33283d;border-radius:18px;background:#201923;color:#f6eff9;box-shadow:0 30px 90px rgba(0,0,0,.55);padding:24px}
    .modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .modal-head h3{margin:0;font-size:19px}
    .modal-head p{margin:4px 0 0;color:#9b94a1;font-size:12px}
    .modal-close{width:38px;height:38px;padding:0;display:grid;place-items:center;background:transparent;border:0;color:#c7bfcb;font-size:24px}
    .integration-form{margin-top:22px}
    .integration-form label{display:block;margin:0 0 8px;font-size:13px;font-weight:700}
    .integration-form .required{color:#f06b75}
    .integration-form input{width:100%;padding:13px 14px;border-radius:10px;border:1px solid #2e2635;background:#110d15;color:#fff;font:inherit;outline:none}
    .integration-form input:focus{border-color:#9d5be4}
    .form-field{margin-top:17px}
    .salt-row{display:grid;grid-template-columns:1fr auto;gap:10px}
    .salt-row button{white-space:nowrap}
    .form-actions{display:grid;grid-template-columns:1fr;gap:10px;margin-top:22px}
    .form-actions button{width:100%;justify-content:center}
    .form-note{margin:10px 0 0;color:#837b89;font-size:11px;line-height:1.5}
    @media (min-width:640px){.integration-filters{grid-template-columns:1fr 1fr}.form-actions{grid-template-columns:1fr 1fr}}
  </style>`;
}

function renderModal({ edit = false, meta = null, configured = false }) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <section class="integration-modal" role="dialog" aria-modal="true" aria-labelledby="integration-modal-title">
      <div class="modal-head">
        <div>
          <div class="integration-icon">⌁</div>
          <h3 id="integration-modal-title" style="margin-top:12px">${edit ? 'Edit integration' : 'New Integration'}</h3>
          <p>${edit ? 'Update integration settings' : 'Connect a SafeLinkU integration'}</p>
        </div>
        <button class="modal-close" type="button" aria-label="Close">×</button>
      </div>
      <form class="integration-form">
        <div class="form-field">
          <label for="integration-name">Name <span class="required">*</span></label>
          <input id="integration-name" maxlength="80" required value="${esc(meta?.name || '')}" placeholder="Getkey system">
        </div>
        <div class="form-field">
          <label for="integration-api-key">SafeLinkU API Key <span class="required">*</span></label>
          <input id="integration-api-key" type="password" autocomplete="new-password" ${edit ? '' : 'required'} placeholder="${edit ? 'Leave blank to keep the current provider key' : 'Paste your SafeLinkU API key'}">
        </div>
        <div class="form-field">
          <label for="integration-salt">Salt <span class="required">*</span></label>
          <div class="salt-row">
            <input id="integration-salt" maxlength="128" required value="${esc(meta?.salt || '')}" placeholder="Generate a secure salt">
            <button class="secondary" id="generate-salt" type="button">Generate</button>
          </div>
        </div>
        <p class="form-note">The API key entered here is never written to browser storage. The production SafeLinkU secret remains controlled by the Worker configuration.</p>
        <div class="form-actions">
          <button class="primary" type="submit">${edit ? 'Update' : 'Create'}</button>
          <button class="secondary" type="button" id="cancel-integration">Cancel</button>
        </div>
      </form>
    </section>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.modal-close').onclick = close;
  modal.querySelector('#cancel-integration').onclick = close;
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  modal.querySelector('#generate-salt').onclick = () => {
    modal.querySelector('#integration-salt').value = generateSalt();
  };
  modal.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = modal.querySelector('#integration-name').value.trim();
    const apiKey = modal.querySelector('#integration-api-key').value.trim();
    const salt = modal.querySelector('#integration-salt').value.trim();
    if (!name || !salt || (!edit && !apiKey)) return;
    writeMeta({
      name,
      salt,
      key_configured: Boolean(apiKey) || Boolean(meta?.key_configured) || configured,
      updated_at: new Date().toISOString(),
    });
    close();
    loadSafeLinkU();
  });
}

async function loadSafeLinkU() {
  const root = document.querySelector('#safelinku-root');
  if (!root) return;
  root.innerHTML = `${styles()}<section class="panel loading"><div class="spinner"></div><b>Loading integrations…</b><span>Reading authenticated SafeLinkU configuration.</span></section>`;
  try {
    const status = await api('/api/v1/safelinku/status');
    const meta = readMeta();
    const configured = Boolean(status.configured);
    const current = meta || (configured ? { name: 'SafeLinkU integration', salt: '', key_configured: true } : null);
    root.innerHTML = `
      <div class="integration-page">
        <div class="integration-heading">
          <div class="heading-copy">
            <div class="integration-icon">⌁</div>
            <div><h2>Integrations</h2><p>Connect and manage your SafeLinkU provider.</p></div>
          </div>
        </div>
        <button class="primary new-integration" id="new-integration">＋&nbsp; New Integration</button>
        <div class="integration-filters">
          <select class="integration-select" aria-label="Integration type"><option>All types</option><option selected>SafeLinkU</option></select>
          <select class="integration-select" aria-label="Integration status"><option selected>All</option><option>Active</option><option>Pending</option></select>
        </div>
        <details class="programs">
          <summary>✨ Partner Programs</summary>
          <div class="program-copy">SafeLinkU is the active provider for the current Frezen get-key integration.</div>
        </details>
        ${current ? `
          <article class="integration-card">
            <div class="integration-card-head">
              <div class="provider-logo">S</div>
              <div><h3>${esc(current.name)}</h3><div class="provider">SafeLinkU</div></div>
            </div>
            <div class="badges">
              <span class="integration-badge ${configured ? '' : 'pending'}"><span class="dot"></span>${configured ? 'Active' : 'Pending configuration'}</span>
              <span class="integration-badge"><span class="dot">✓</span>Flow-Ready</span>
            </div>
            <div class="integration-actions">
              <button class="primary edit-button" id="edit-integration">✎&nbsp; Edit</button>
              <button class="secondary more-button" id="more-integration" aria-label="More options">•••</button>
            </div>
          </article>` : `
          <div class="empty-integration"><b>No SafeLinkU integration yet</b>Click “New Integration” to create one.</div>`}
      </div>`;

    document.querySelector('#new-integration')?.addEventListener('click', () => renderModal({ configured }));
    document.querySelector('#edit-integration')?.addEventListener('click', () => renderModal({ edit: true, meta: current, configured }));
    document.querySelector('#more-integration')?.addEventListener('click', () => {
      const card = document.querySelector('.integration-card');
      const existing = card.querySelector('.integration-menu');
      if (existing) return existing.remove();
      const menu = document.createElement('div');
      menu.className = 'integration-menu';
      menu.style.cssText = 'margin-top:10px;padding:12px;border:1px solid #3b2f44;border-radius:10px;color:#9b94a1;font-size:12px;';
      menu.textContent = 'Delete integration is intentionally not enabled in this UI phase.';
      card.appendChild(menu);
    });
  } catch (error) {
    root.innerHTML = `${styles()}<section class="hero error"><div><p class="eyebrow">SAFE LINK U ERROR</p><h2>Unable to load integrations</h2><p>${esc(error.message)}</p></div><button class="primary" id="safelinku-retry">Retry</button></section>`;
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
