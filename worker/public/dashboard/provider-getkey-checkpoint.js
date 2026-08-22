const PROVIDERS_KEY = 'frezen.providers.v1';
const CHECKPOINTS_KEY = 'frezen.safelinku.checkpoints.v1';

const readJson = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
  return data;
}

function updateSequenceCount(root) {
  const count = root.querySelector('.provider-sequence-head > span');
  if (!count) return;
  count.textContent = `${root.querySelectorAll('.provider-checkpoint:checked').length} selected`;
}

function appendCheckpointRow(root, checkpoint) {
  const list = root.querySelector('.provider-checkpoint-list');
  if (!list || !checkpoint?.id) return;

  const existing = list.querySelector(`.provider-checkpoint[value="${CSS.escape(checkpoint.id)}"]`);
  if (existing) {
    existing.checked = true;
    updateSequenceCount(root);
    return;
  }

  const empty = list.querySelector('.provider-no-checkpoints');
  if (empty) list.innerHTML = '';

  const row = document.createElement('label');
  row.className = 'provider-checkpoint-row';
  row.dataset.name = `${checkpoint.name || ''} ${checkpoint.id}`.toLowerCase();
  row.innerHTML = `<input class="provider-checkpoint" type="checkbox" value="${checkpoint.id}" checked><span><b></b><small>SafeLinkU checkpoint · ${checkpoint.id}</small></span><strong>+</strong>`;
  row.querySelector('b').textContent = checkpoint.name || 'GetKey checkpoint';
  list.prepend(row);
  updateSequenceCount(root);
}

async function addGetKeyCheckpoint(root, trigger) {
  if (trigger.dataset.busy === '1') return;
  trigger.dataset.busy = '1';
  const original = trigger.textContent;
  trigger.textContent = '…';

  try {
    const status = await api('/api/v1/safelinku/status');
    if (!status.configured || !status.api_key_configured) {
      throw new Error('SafeLinkU API key is not configured on the Worker. Set SAFELINKU_API_KEY first.');
    }

    const defaultName = `GetKey Checkpoint ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric' })}`;
    const name = window.prompt('Checkpoint name', defaultName);
    if (!name?.trim()) return;

    const result = await api('/api/v1/safelinku/checkpoints/create', {
      method: 'POST',
      body: JSON.stringify({ checkpoint_id: crypto.randomUUID(), name: name.trim() }),
    });

    if (result.status !== 'ok' || !result.checkpoint?.id) {
      throw new Error(result.error || 'SafeLinkU checkpoint creation failed');
    }

    const checkpointData = await api('/api/v1/safelinku/checkpoints');
    const remote = Array.isArray(checkpointData.checkpoints) ? checkpointData.checkpoints : [result.checkpoint];
    writeJson(CHECKPOINTS_KEY, remote.map((row) => ({
      id: row.id,
      name: row.name,
      reference: row.url || '',
      url: row.url || '',
      type: row.type || 'safelinku',
      enabled: row.active !== false,
      generated_by: 'server',
      integration: 'SafeLinkU',
      updated_at: row.updated_at || new Date().toISOString(),
    })));

    appendCheckpointRow(root, result.checkpoint);
  } catch (error) {
    alert(`Add Get-Key checkpoint failed: ${error.message}`);
  } finally {
    trigger.dataset.busy = '0';
    trigger.textContent = original;
  }
}

function bindGetKeyButton(root) {
  const button = root.querySelector('.provider-plus');
  if (!button || button.dataset.getkeyBound === '1') return;
  button.dataset.getkeyBound = '1';
  button.setAttribute('role', 'button');
  button.setAttribute('tabindex', '0');
  button.title = 'Add a SafeLinkU Get-Key checkpoint to the sequence';
  button.addEventListener('click', () => addGetKeyCheckpoint(root, button));
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      addGetKeyCheckpoint(root, button);
    }
  });
}

function bindModal() {
  document.querySelectorAll('.provider-config-modal').forEach(bindGetKeyButton);
}

const observer = new MutationObserver(bindModal);
observer.observe(document.body, { childList: true, subtree: true });
bindModal();
