(() => {
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;' }[c]));

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { accept: 'application/json', ...(options.headers || {}) },
    });
    if (response.status === 401) {
      location.href = '/login';
      throw new Error('SESSION_EXPIRED');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
    return data;
  }

  function showModal(title, value, unavailable = false) {
    document.querySelector('#key-secret-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'key-secret-modal';
    modal.innerHTML = `<div style="position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.68);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px"><section style="width:min(100%,560px);background:#1b1723;border:1px solid rgba(255,255,255,.08);border-radius:18px;box-shadow:0 30px 100px rgba(0,0,0,.5);overflow:hidden"><header style="display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.06)"><div><p class="eyebrow" style="margin:0 0 4px">KEY SYSTEM</p><h3 style="margin:0">${escapeHtml(title)}</h3></div><button id="key-secret-close" style="border:0;background:transparent;color:#aeb8c4;font-size:24px">×</button></header><div style="padding:20px"><label style="display:block;color:#9ba6b5;font-size:11px;margin-bottom:7px">Original key</label><div style="display:flex;gap:8px"><input id="key-secret-value" type="text" value="${escapeHtml(value)}" readonly style="flex:1;min-width:0;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#0d0a11;color:#fff;padding:12px;font:12px ui-monospace,monospace"><button id="key-secret-copy" class="key-button primary" ${unavailable ? 'disabled' : ''}>Copy</button></div><p style="margin:10px 0 0;color:#7e8a9b;font-size:11px">${unavailable ? 'This key was created before secure key viewing was enabled and cannot be recovered. Create a new key to store a recoverable encrypted copy.' : 'The key is decrypted only for this Owner request and is never included in the key list API.'}</p></div><footer style="display:flex;justify-content:flex-end;padding:14px 20px;border-top:1px solid rgba(255,255,255,.06)"><button id="key-secret-done" class="key-button secondary">Done</button></footer></section></div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('#key-secret-close').onclick = close;
    modal.querySelector('#key-secret-done').onclick = close;
    modal.querySelector('#key-secret-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(value);
        modal.querySelector('#key-secret-copy').textContent = 'Copied';
      } catch {
        alert('Unable to copy the key automatically. Select the key and copy it manually.');
      }
    };
  }

  async function reveal(keyId) {
    try {
      const data = await api(`/api/v1/key-control/keys/${encodeURIComponent(keyId)}/secret`);
      showModal('Key', data.key || '');
    } catch (error) {
      if (String(error.message) === 'KEY_SECRET_UNAVAILABLE') {
        showModal('Key unavailable', '', true);
        return;
      }
      alert(`Unable to view key: ${error.message}`);
    }
  }

  async function copyKey(keyId) {
    try {
      const data = await api(`/api/v1/key-control/keys/${encodeURIComponent(keyId)}/secret`);
      await navigator.clipboard.writeText(data.key);
      alert('Key copied.');
    } catch (error) {
      if (String(error.message) === 'KEY_SECRET_UNAVAILABLE') {
        alert('This key cannot be recovered because it was created before secure key viewing was enabled.');
        return;
      }
      alert(`Unable to copy key: ${error.message}`);
    }
  }

  async function deleteKey(keyId) {
    if (!confirm('Delete this key permanently? The key, license record and related HWID bindings will be removed.')) return;
    try {
      await api(`/api/v1/key-control/keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' });
      document.querySelector('#key-refresh')?.click();
      alert('Key deleted.');
    } catch (error) {
      alert(`Unable to delete key: ${error.message}`);
    }
  }

  function enhanceCard(card) {
    if (!card || card.dataset.keySecretEnhanced === '1') return;
    const idNode = card.querySelector('.key-card-id');
    const keyId = idNode?.textContent?.split('·')[0]?.trim();
    const actions = card.querySelector('.key-card-actions');
    if (!keyId || !actions) return;
    card.dataset.keySecretEnhanced = '1';

    actions.querySelectorAll('[data-copy-id]').forEach((button) => button.remove());
    actions.querySelectorAll('[data-action="hwid"]').forEach((button) => button.remove());

    const view = document.createElement('button');
    view.className = 'key-button secondary';
    view.textContent = 'View Key';
    view.dataset.keySecretAction = 'view';
    view.dataset.keyId = keyId;

    const copy = document.createElement('button');
    copy.className = 'key-button secondary';
    copy.textContent = 'Copy Key';
    copy.dataset.keySecretAction = 'copy';
    copy.dataset.keyId = keyId;

    const remove = document.createElement('button');
    remove.className = 'key-button danger';
    remove.textContent = 'Delete';
    remove.dataset.keySecretAction = 'delete';
    remove.dataset.keyId = keyId;

    actions.prepend(view, copy);
    actions.appendChild(remove);
  }

  function enhanceAll() {
    document.querySelectorAll('#key-list .key-card').forEach(enhanceCard);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-key-secret-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const action = button.dataset.keySecretAction;
    const id = button.dataset.keyId;
    if (action === 'view') reveal(id);
    else if (action === 'copy') copyKey(id);
    else if (action === 'delete') deleteKey(id);
  }, true);

  const observer = new MutationObserver(enhanceAll);
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(enhanceAll, 0);
})();
