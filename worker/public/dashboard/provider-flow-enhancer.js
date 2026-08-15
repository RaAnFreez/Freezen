const PROVIDERS_KEY = 'frezen.providers.v1';
const SERVICES_KEY = 'frezen.services.v1';
const CHECKPOINTS_KEY = 'frezen.safelinku.checkpoints.v1';

const readJson = (key, fallback) => {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; }
};

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const validCheckpointUrl = (value) => { try { const url = new URL(value); return url.protocol === 'https:' ? url : null; } catch { return null; } };

function getProviderData(card) {
  const providers = readJson(PROVIDERS_KEY, []);
  const services = readJson(SERVICES_KEY, []);
  const checkpoints = readJson(CHECKPOINTS_KEY, []);
  const provider = providers.find((row) => row.id === card?.dataset.id);
  if (!provider) return null;
  const service = services.find((row) => row.id === provider.service_id);
  const selected = (provider.checkpoints || []).map((id) => checkpoints.find((row) => row.id === id)).filter(Boolean);
  return { provider, service, checkpoints: selected };
}

async function runProviderTest(card, button) {
  const data = getProviderData(card);
  if (!data) return;
  const flowId = crypto.randomUUID();
  const fallbackCheckpoint = data.checkpoints.find((row) => validCheckpointUrl(row.url || row.reference));

  button.disabled = true;
  button.textContent = 'Testing…';
  showTestResult(card, `Creating SafeLinkU checkpoint…\nFlow test ID: ${flowId}`);

  try {
    const response = await fetch('/api/v1/safelinku/test-connection', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.status !== 'ok' || !result.url) {
      const detail = result.error ? `: ${result.error}` : '';
      throw new Error(`SafeLinkU link creation failed (HTTP ${result.http_status ?? response.status})${detail}`);
    }

    const checkpointUrl = validCheckpointUrl(result.url)?.toString();
    if (!checkpointUrl) throw new Error('SafeLinkU returned an invalid HTTPS checkpoint URL.');

    const checkpointName = fallbackCheckpoint?.name || 'SafeLinkU generated checkpoint';
    showTestResult(card, `SafeLinkU connection OK\nFlow test ID: ${flowId}\nCheckpoint: ${checkpointName}\nOpening generated SafeLinkU checkpoint…`);

    const testUrl = new URL(checkpointUrl);
    testUrl.searchParams.set('frezen_flow', flowId);
    window.open(testUrl.toString(), '_blank', 'noopener,noreferrer');
  } catch (error) {
    showTestResult(card, `${error.message}\nFlow test ID: ${flowId}`, true);
  } finally {
    button.disabled = false;
    button.textContent = '⚡ Test';
  }
}

function showTestResult(card, text, error = false) {
  let box = card.querySelector('.provider-test-result');
  if (!box) { box = document.createElement('div'); box.className = 'provider-test-result'; card.appendChild(box); }
  box.classList.toggle('error', error);
  box.textContent = text;
}

function enhanceCard(card) {
  if (!card || card.dataset.flowEnhanced === '1') return;
  const actions = card.querySelector('.provider-actions');
  if (!actions) return;
  const edit = actions.querySelector('.configure');
  if (!edit) return;

  const test = document.createElement('button');
  test.type = 'button';
  test.className = 'secondary provider-test';
  test.textContent = '⚡ Test';
  test.addEventListener('click', () => runProviderTest(card, test));
  actions.insertBefore(test, edit);
  actions.classList.add('provider-actions-triple');
  card.dataset.flowEnhanced = '1';
}

function enhanceProviderCards() { document.querySelectorAll('.provider-card').forEach(enhanceCard); }
const observer = new MutationObserver(enhanceProviderCards);
observer.observe(document.body, { childList: true, subtree: true });
enhanceProviderCards();
