(() => {
  const STATE_KEYS = ['frezen.services.v1', 'frezen.providers.v1', 'frezen.safelinku.checkpoints.v1'];
  let syncPromise = null;
  let hydrating = false;

  const read = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : [])); } catch {} };

  async function getCanonicalState() {
    const response = await fetch('/api/v1/dashboard/state', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return { services: Array.isArray(data.services) ? data.services : [], providers: Array.isArray(data.providers) ? data.providers : [], checkpoints: Array.isArray(data.checkpoints) ? data.checkpoints : [] };
  }

  function hydrateLocal(state) {
    hydrating = true;
    try {
      write(STATE_KEYS[0], state.services);
      write(STATE_KEYS[1], state.providers);
      write(STATE_KEYS[2], state.checkpoints);
    } finally { hydrating = false; }
    return state;
  }

  async function syncToServer(force = false) {
    if (syncPromise && !force) return syncPromise;
    syncPromise = (async () => {
      const response = await fetch('/api/v1/key-system/sync', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ services: read(STATE_KEYS[0]), providers: read(STATE_KEYS[1]), checkpoints: read(STATE_KEYS[2]) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      return data;
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  }

  async function hydrate() { return hydrateLocal(await getCanonicalState()); }

  async function getScript(scriptId) {
    const response = await fetch(`/api/v1/scripts/${encodeURIComponent(scriptId)}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data.script;
  }

  async function ensureScriptBinding(scriptId) {
    const script = await getScript(scriptId);
    if (!script?.service_id) throw new Error('SCRIPT_SERVICE_NOT_CONFIGURED');
    await syncToServer(true);
    const state = await hydrate();
    const provider = state.providers.find((row) => String(row.service_id || '') === String(script.service_id) && row.active !== false && row.active !== 0);
    if (!provider) {
      const serviceName = script.service_name ? ` (${script.service_name})` : '';
      throw new Error(`No active provider is linked to this script service${serviceName}. Configure the provider for this exact service, then try again.`);
    }
    return { script, provider, state };
  }

  async function generateKeyForScript(scriptId, validity = {}) {
    const binding = await ensureScriptBinding(scriptId);
    const response = await fetch('/api/v1/key-control/keys', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ provider_id: binding.provider.id, service_id: binding.script.service_id, key_name: `${binding.script.name} key`, days: Number.isFinite(validity.days) ? validity.days : 30, hours: Number.isFinite(validity.hours) ? validity.hours : 0, minutes: Number.isFinite(validity.minutes) ? validity.minutes : 0, max_devices: Math.max(1, Number(binding.provider.max_hwids_per_key || 1)), forever: false }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return { ...data, binding };
  }

  window.FrezenIntegration = { stateKeys: STATE_KEYS, read, write, getCanonicalState, getOptions: getCanonicalState, syncToServer, hydrate, getScript, ensureScriptBinding, generateKeyForScript };

  let timer = null;
  const schedule = () => {
    if (hydrating) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncToServer().catch(() => {}), 250);
  };
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function(key, value) { const result = originalSetItem.call(this, key, value); if (STATE_KEYS.includes(key)) schedule(); return result; };
  Storage.prototype.removeItem = function(key) { const result = originalRemoveItem.call(this, key); if (STATE_KEYS.includes(key)) schedule(); return result; };
  window.addEventListener('storage', (event) => { if (STATE_KEYS.includes(event.key)) schedule(); });

  window.FrezenIntegrationReady = hydrate().catch(() => null);
})();
