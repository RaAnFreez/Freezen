(() => {
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(options.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        ...(options.headers || {}),
      },
      ...options,
    });
    if (response.status === 401) {
      location.href = '/login';
      return null;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  };

  const setStatus = (text, error = false) => {
    let box = document.querySelector('[data-frezen-script-key-status]');
    if (!box) {
      box = document.createElement('div');
      box.dataset.frezenScriptKeyStatus = '1';
      box.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:5000;max-width:min(92vw,680px);padding:12px 16px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#111722;color:#e7edf5;box-shadow:0 18px 50px rgba(0,0,0,.45);font:13px/1.45 system-ui,sans-serif;white-space:pre-wrap;';
      document.body.appendChild(box);
    }
    box.textContent = text;
    box.style.borderColor = error ? 'rgba(255,110,110,.35)' : 'rgba(100,220,150,.28)';
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.remove(), 7000);
  };

  function actionButtons(card) {
    const actions = card.querySelector('.lua-actions');
    if (!actions) return null;
    const existing = card.querySelector('[data-frezen-key-action]');
    if (existing) return actions;

    const detail = card.querySelector('[data-act="details"][data-id]');
    const scriptId = detail?.dataset.id;
    if (!scriptId) return null;

    const keyButton = document.createElement('button');
    keyButton.type = 'button';
    keyButton.className = 'lua-btn primary';
    keyButton.textContent = 'Generate Key';
    keyButton.dataset.frezenKeyAction = scriptId;

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'lua-btn';
    deleteButton.textContent = 'Delete';
    deleteButton.style.color = '#ffb4b4';
    deleteButton.dataset.frezenDeleteAction = scriptId;

    keyButton.addEventListener('click', () => generateKey(scriptId, keyButton));
    deleteButton.addEventListener('click', () => deleteScript(scriptId, deleteButton));

    actions.append(keyButton, deleteButton);
    return actions;
  }

  async function generateKey(scriptId, button) {
    if (button.disabled) return;
    button.disabled = true;
    try {
      if (window.FrezenIntegration?.generateKeyForScript) {
        const created = await window.FrezenIntegration.generateKeyForScript(scriptId, { days: 30, hours: 0, minutes: 0 });
        const key = created?.license_key;
        const scriptName = created?.binding?.script?.name || 'script';
        if (!key) throw new Error('Key creation succeeded but no key was returned.');
        try {
          await navigator.clipboard?.writeText(key);
          setStatus(`Key created for ${scriptName} and copied to clipboard:\n${key}`);
        } catch {
          setStatus(`Key created for ${scriptName}:\n${key}`);
        }
        return;
      }

      // Compatibility fallback if the integration hub has not loaded yet.
      const scriptData = await api(`/api/v1/scripts/${encodeURIComponent(scriptId)}`);
      if (!scriptData?.script) throw new Error('Script not found.');
      const script = scriptData.script;
      const options = await api('/api/v1/key-control/options');
      const provider = (options?.providers || []).find((item) => String(item.service_id || '') === String(script.service_id || ''));
      if (!provider) throw new Error('No active provider is linked to this script service.');
      const created = await api('/api/v1/key-control/keys', {
        method: 'POST',
        body: JSON.stringify({ provider_id: provider.id, service_id: script.service_id, key_name: `${script.name} key`, days: 30, hours: 0, minutes: 0, max_devices: Math.max(1, Number(provider.max_hwids_per_key || 1)), forever: false }),
      });
      const key = created?.license_key;
      if (!key) throw new Error('Key creation succeeded but no key was returned.');
      setStatus(`Key created for ${script.name}:\n${key}`);
    } catch (error) {
      setStatus(error.message || 'Unable to generate key.', true);
    } finally {
      button.disabled = false;
    }
  }

  async function deleteScript(scriptId, button) {
    if (button.disabled) return;
    if (!window.confirm('Delete this script and all stored versions? This cannot be undone.')) return;
    button.disabled = true;
    try {
      await api(`/api/v1/scripts/${encodeURIComponent(scriptId)}`, { method: 'DELETE' });
      setStatus('Script deleted.');
      const card = button.closest('.lua-card');
      card?.remove();
    } catch (error) {
      setStatus(error.message || 'Unable to delete script.', true);
      button.disabled = false;
    }
  }

  function enhance() {
    document.querySelectorAll('.lua-card').forEach(actionButtons);
  }

  const observer = new MutationObserver(enhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  enhance();
})();
