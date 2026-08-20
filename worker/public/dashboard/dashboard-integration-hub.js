(() => {
  const STATE_KEYS = ['frezen.services.v1', 'frezen.providers.v1', 'frezen.safelinku.checkpoints.v1'];
  let syncPromise = null;

  const read = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  };

  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : [])); } catch {}
  };

  async function syncToServer(force = false) {
    if (syncPromise && !force) return syncPromise;
    syncPromise = (async () => {
      const response = await fetch('/api/v1/key-system/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          services: read(STATE_KEYS[0]),
          providers: read(STATE_KEYS[1]),
          checkpoints: read(STATE_KEYS[2]),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      return data;
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  }

  async function getOptions() {
    const response = await fetch('/api/v1/key-control/options', {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  }

  function mergeServerState(options) {
    if (Array.isArray(options?.services) && options.services.length) {
      const local = read(STATE_KEYS[0]);
      const byId = new Map(local.map((row) => [String(row?.id || ''), row]));
      const merged = options.services.map((row) => ({ ...(byId.get(String(row.id)) || {}), ...row }));
      const localOnly = local.filter((row) => !options.services.some((serverRow) => String(serverRow.id) === String(row?.id)));
      write(STATE_KEYS[0], [...merged, ...localOnly]);
    }
    if (Array.isArray(options?.providers) && options.providers.length) {
      const local = read(STATE_KEYS[1]);
      const byId = new Map(local.map((row) => [String(row?.id || ''), row]));
      const merged = options.providers.map((row) => ({ ...(byId.get(String(row.id)) || {}), ...row }));
      const localOnly = local.filter((row) => !options.providers.some((serverRow) => String(serverRow.id) === String(row?.id)));
      write(STATE_KEYS[1], [...merged, ...localOnly]);
    }
    return options;
  }

  async function hydrate() {
    await syncToServer(true);
    const options = await getOptions();
    return mergeServerState(options);
  }

  async function getScript(scriptId) {
    const response = await fetch(`/api/v1/scripts/${encodeURIComponent(scriptId)}`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data.script;
  }

  async function ensureScriptBinding(scriptId) {
    const script = await getScript(scriptId);
    if (!script?.service_id) throw new Error('SCRIPT_SERVICE_NOT_CONFIGURED');

    let options = await hydrate();
    let provider = (options.providers || []).find((row) => String(row.service_id || '') === String(script.service_id));
    if (provider?.active !== false) return { script, provider, options };

    // Retry once after syncing the currently selected local provider/service state.
    await syncToServer(true);
    options = await getOptions();
    provider = (options.providers || []).find((row) => String(row.service_id || '') === String(script.service_id) && row.active !== 0 && row.active !== false);
    if (provider) return { script, provider, options };

    const localProviders = read(STATE_KEYS[1]);
    const localServices = read(STATE_KEYS[0]);
    const localService = localServices.find((row) => String(row?.id || '') === String(script.service_id) || String(row?.slug || '').toLowerCase() === String(script.service_slug || '').toLowerCase());
    const localProvider = localProviders.find((row) => String(row?.service_id || '') === String(script.service_id) || (localService && String(row?.service_id || '') === String(localService.id)));

    if (localService && localProvider) {
      await fetch('/api/v1/key-system/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ services: [localService], providers: [{ ...localProvider, service_id: script.service_id }], checkpoints: read(STATE_KEYS[2]) }),
      });
      options = await getOptions();
      provider = (options.providers || []).find((row) => String(row.service_id || '') === String(script.service_id) && row.active !== 0 && row.active !== false);
      if (provider) return { script, provider, options };
    }

    const serviceName = script.service_name ? ` (${script.service_name})` : '';
    throw new Error(`No active provider is linked to this script service${serviceName}. Open Providers, select this exact service, save it, then try Generate Key again.`);
  }

  async function generateKeyForScript(scriptId, validity = {}) {
    const binding = await ensureScriptBinding(scriptId);
    const body = {
      provider_id: binding.provider.id,
      service_id: binding.script.service_id,
      key_name: `${binding.script.name} key`,
      days: Number.isFinite(validity.days) ? validity.days : 30,
      hours: Number.isFinite(validity.hours) ? validity.hours : 0,
      minutes: Number.isFinite(validity.minutes) ? validity.minutes : 0,
      max_devices: Math.max(1, Number(binding.provider.max_hwids_per_key || 1)),
      forever: false,
    };
    const response = await fetch('/api/v1/key-control/keys', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return { ...data, binding };
  }

  window.FrezenIntegration = {
    stateKeys: STATE_KEYS,
    read,
    write,
    syncToServer,
    getOptions,
    hydrate,
    getScript,
    ensureScriptBinding,
    generateKeyForScript,
  };

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => syncToServer().catch(() => {}), 200); };
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function(key, value) {
    const result = originalSetItem.call(this, key, value);
    if (STATE_KEYS.includes(key)) schedule();
    return result;
  };
  Storage.prototype.removeItem = function(key) {
    const result = originalRemoveItem.call(this, key);
    if (STATE_KEYS.includes(key)) schedule();
    return result;
  };
  window.addEventListener('storage', (event) => { if (STATE_KEYS.includes(event.key)) schedule(); });
  syncToServer().catch(() => {});
})();
