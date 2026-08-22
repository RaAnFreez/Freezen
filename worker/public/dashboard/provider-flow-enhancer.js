const PROVIDERS_KEY = 'frezen.providers.v1';
const SERVICES_KEY = 'frezen.services.v1';
const CHECKPOINTS_KEY = 'frezen.safelinku.checkpoints.v1';
const readJson = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
  return data;
}

async function syncDashboardState() {
  const body = {
    services: readJson(SERVICES_KEY, []),
    providers: readJson(PROVIDERS_KEY, []),
    checkpoints: readJson(CHECKPOINTS_KEY, []),
  };
  await api('/api/v1/key-system/sync', { method: 'POST', body: JSON.stringify(body) });
}

async function hydrateSafeLinkUState() {
  try {
    const [status, checkpointResult] = await Promise.all([
      api('/api/v1/safelinku/status'),
      api('/api/v1/safelinku/checkpoints'),
    ]);
    const remote = Array.isArray(checkpointResult.checkpoints) ? checkpointResult.checkpoints : [];
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
    document.querySelectorAll('.provider-connection').forEach((box) => {
      const label = box.querySelector('small');
      const ready = Boolean(status.configured && status.api_key_configured);
      box.classList.toggle('ready', ready);
      box.classList.toggle('pending', !ready);
      if (label) label.textContent = ready ? 'Connected through the Worker SafeLinkU secret.' : 'Pending — configure SAFELINKU_API_KEY in Worker secrets.';
    });
    document.querySelectorAll('.provider-footer-warning').forEach((box) => {
      const title = box.querySelector('b');
      const sub = box.querySelector('small');
      const ready = Boolean(status.configured && status.api_key_configured);
      if (title) title.textContent = ready ? 'SafeLinkU ready' : 'No SafeLinkU secret configured';
      if (sub) sub.textContent = ready ? 'This provider can reference backend checkpoints.' : 'Configure the Worker secret before expecting a live GetKey flow.';
    });
    document.querySelectorAll('.provider-checkpoint-list').forEach((list) => {
      const checked = new Set([...list.querySelectorAll('.provider-checkpoint:checked')].map((input) => input.value));
      list.innerHTML = remote.length ? remote.map((checkpoint) => `<label class="provider-checkpoint-row" data-name="${esc(`${checkpoint.name} ${checkpoint.id}`.toLowerCase())}"><input class="provider-checkpoint" type="checkbox" value="${esc(checkpoint.id)}" ${checked.has(checkpoint.id) ? 'checked' : ''}><span><b>${esc(checkpoint.name)}</b><small>SafeLinkU checkpoint · ${esc(checkpoint.id)}</small></span><strong>+</strong></label>`).join('') : '<div class="provider-no-checkpoints"><div>▦</div><b>No checkpoints yet.</b><span>Create a checkpoint in SafeLinkU first.</span></div>';
    });
  } catch (error) {
    document.querySelectorAll('.provider-connection small').forEach((node) => { node.textContent = `SafeLinkU state unavailable: ${error.message}`; });
  }
}

function getProviderData(card) {
  const providers = readJson(PROVIDERS_KEY, []); const services = readJson(SERVICES_KEY, []); const checkpoints = readJson(CHECKPOINTS_KEY, []);
  const provider = providers.find((row) => row.id === card?.dataset.id); if (!provider) return null;
  const service = services.find((row) => row.id === provider.service_id);
  const selected = (provider.checkpoints || []).map((id) => checkpoints.find((row) => row.id === id)).filter(Boolean);
  return { provider, service, checkpoints: selected };
}

async function runProviderTest(card, button) {
  const data = getProviderData(card); if (!data) return;
  const flowId = crypto.randomUUID();
  const checkpoints = data.checkpoints.map((row) => ({ ...row, checkpointUrl: row.url || row.reference })).filter((row) => /^https:\/\//i.test(row.checkpointUrl || ''));
  button.disabled = true; button.textContent = 'Testing…';
  try {
    if (!checkpoints.length) throw new Error('This Provider has no backend SafeLinkU checkpoints configured. Open SafeLinkU and create one first.');
    const first = checkpoints[0];
    showTestResult(card, `Provider flow ready\nFlow test ID: ${flowId}\nCheckpoint 1/${checkpoints.length}: ${first.name}\nOpening configured checkpoint…`);
    window.open(first.checkpointUrl, '_blank', 'noopener,noreferrer');
  } catch (error) { showTestResult(card, `${error.message}\nFlow test ID: ${flowId}`, true); } finally { button.disabled = false; button.textContent = '⚡ Test'; }
}

async function syncAfterProviderSave() {
  try { await new Promise((resolve) => setTimeout(resolve, 100)); await hydrateSafeLinkUState(); await syncDashboardState(); } catch (error) { console.warn('provider sync skipped', error); }
}

function showTestResult(card, text, error = false) { let box = card.querySelector('.provider-test-result'); if (!box) { box = document.createElement('div'); box.className = 'provider-test-result'; card.appendChild(box); } box.classList.toggle('error', error); box.textContent = text; }
function enhanceCard(card) { if (!card || card.dataset.flowEnhanced === '1') return; const actions = card.querySelector('.provider-actions'); if (!actions) return; const edit = actions.querySelector('.configure'); if (!edit) return; const test = document.createElement('button'); test.type = 'button'; test.className = 'secondary provider-test'; test.textContent = '⚡ Test'; test.addEventListener('click', () => runProviderTest(card, test)); actions.insertBefore(test, edit); actions.classList.add('provider-actions-triple'); card.dataset.flowEnhanced = '1'; }
function enhance() { document.querySelectorAll('.provider-card').forEach(enhanceCard); document.querySelectorAll('.provider-config-modal').forEach(() => { hydrateSafeLinkUState(); }); }

document.addEventListener('submit', (event) => { if (event.target?.closest('.provider-config-modal')) syncAfterProviderSave(); }, true);
const observer = new MutationObserver(enhance); observer.observe(document.body, { childList: true, subtree: true });
enhance();
hydrateSafeLinkUState();
