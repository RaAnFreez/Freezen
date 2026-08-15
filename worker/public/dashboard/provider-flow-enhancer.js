const PROVIDERS_KEY = 'frezen.providers.v1';
const SERVICES_KEY = 'frezen.services.v1';
const CHECKPOINTS_KEY = 'frezen.safelinku.checkpoints.v1';
const readJson = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; } };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const validCheckpointUrl = (value) => { try { const url = new URL(value); return url.protocol === 'https:' ? url : null; } catch { return null; } };

function getProviderData(card) {
  const providers = readJson(PROVIDERS_KEY, []); const services = readJson(SERVICES_KEY, []); const checkpoints = readJson(CHECKPOINTS_KEY, []);
  const provider = providers.find((row) => row.id === card?.dataset.id); if (!provider) return null;
  const service = services.find((row) => row.id === provider.service_id);
  const selected = (provider.checkpoints || []).map((id) => checkpoints.find((row) => row.id === id)).filter(Boolean);
  return { provider, service, checkpoints: selected };
}

function addCheckpointOpeners(modal) {
  if (!modal || modal.dataset.checkpointOpeners === '1') return;
  modal.querySelectorAll('.provider-checkpoint-row').forEach((row) => {
    const input = row.querySelector('.provider-checkpoint'); if (!input) return;
    const checkpoint = readJson(CHECKPOINTS_KEY, []).find((item) => item.id === input.value); const url = validCheckpointUrl(checkpoint?.url || checkpoint?.reference);
    if (!url) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary provider-checkpoint-open'; button.textContent = 'Open'; button.style.marginLeft = '8px'; button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); window.open(url.toString(), '_blank', 'noopener,noreferrer'); }); row.appendChild(button);
  });
  modal.dataset.checkpointOpeners = '1';
}

async function runProviderTest(card, button) {
  const data = getProviderData(card); if (!data) return;
  const flowId = crypto.randomUUID();
  const checkpoints = data.checkpoints.map((row) => ({ ...row, checkpointUrl: validCheckpointUrl(row.url || row.reference)?.toString() })).filter((row) => row.checkpointUrl);
  button.disabled = true; button.textContent = 'Testing…';
  try {
    if (!checkpoints.length) throw new Error('This Provider has no SafeLinkU checkpoint URL configured. Create a checkpoint first.');
    const first = checkpoints[0];
    showTestResult(card, `Provider flow ready\nFlow test ID: ${flowId}\nCheckpoint 1/${checkpoints.length}: ${first.name}\nOpening configured SafeLinkU checkpoint…`);
    const target = new URL(first.checkpointUrl); target.searchParams.set('frezen_flow', flowId); target.searchParams.set('checkpoint_index', '0'); target.searchParams.set('checkpoint_total', String(checkpoints.length));
    window.open(target.toString(), '_blank', 'noopener,noreferrer');
  } catch (error) { showTestResult(card, `${error.message}\nFlow test ID: ${flowId}`, true); } finally { button.disabled = false; button.textContent = '⚡ Test'; }
}

function showTestResult(card, text, error = false) { let box = card.querySelector('.provider-test-result'); if (!box) { box = document.createElement('div'); box.className = 'provider-test-result'; card.appendChild(box); } box.classList.toggle('error', error); box.textContent = text; }
function enhanceCard(card) { if (!card || card.dataset.flowEnhanced === '1') return; const actions = card.querySelector('.provider-actions'); if (!actions) return; const edit = actions.querySelector('.configure'); if (!edit) return; const test = document.createElement('button'); test.type = 'button'; test.className = 'secondary provider-test'; test.textContent = '⚡ Test'; test.addEventListener('click', () => runProviderTest(card, test)); actions.insertBefore(test, edit); actions.classList.add('provider-actions-triple'); card.dataset.flowEnhanced = '1'; }
function enhance() { document.querySelectorAll('.provider-card').forEach(enhanceCard); document.querySelectorAll('.provider-config-modal').forEach(addCheckpointOpeners); }
const observer = new MutationObserver(enhance); observer.observe(document.body, { childList: true, subtree: true });
enhance();
