(() => {
  const getRoot = () => document.querySelector('#lua-grid');
  const isSourceManagerView = () => document.querySelector('#title')?.textContent?.trim() === 'Lua Scripts';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  async function deleteScript(id, name) {
    if (!id) return;
    if (!confirm(`Delete script "${name || id}"? This removes the script and its stored versions.`)) return;
    try {
      const response = await fetch(`/api/v1/scripts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      });
      if (response.status === 401) {
        location.href = '/login';
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      window.dispatchEvent(new CustomEvent('frezen:scripts-changed', { detail: { id } }));
      const refresh = document.querySelector('#lua-refresh');
      if (refresh) refresh.click();
    } catch (error) {
      alert(`Delete failed: ${esc(error.message)}`);
    }
  }

  function removeDeliveryDeleteButtons(root) {
    root.querySelectorAll('[data-act="delete-script"]').forEach((button) => button.remove());
  }

  function mountDeleteButtons() {
    const root = getRoot();
    if (!root) return;

    // Script Delivery is intentionally a non-destructive delivery view.
    // Only the Lua Scripts source-management tab may expose Delete.
    if (!isSourceManagerView()) {
      removeDeliveryDeleteButtons(root);
      return;
    }

    root.querySelectorAll('.lua-card').forEach((card) => {
      if (card.querySelector('[data-act="delete-script"]')) return;
      const source = card.querySelector('[data-act="details"]');
      if (!source) return;
      const id = source.getAttribute('data-id');
      const title = card.querySelector('h3')?.textContent?.trim() || id;
      const actions = card.querySelector('.lua-actions');
      if (!actions) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lua-btn';
      button.dataset.act = 'delete-script';
      button.dataset.id = id || '';
      button.textContent = 'Delete';
      button.style.color = '#ff8b9e';
      button.title = 'Delete the source script and its stored versions';
      button.onclick = () => deleteScript(id, title);
      actions.appendChild(button);
    });
  }

  const observer = new MutationObserver(mountDeleteButtons);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('frezen:scripts-changed', mountDeleteButtons);
  window.addEventListener('popstate', mountDeleteButtons);
  mountDeleteButtons();
})();
