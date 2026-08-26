function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]));
}

function installModal(root) {
  if (root.querySelector('#script-loader-modal')) return;
  root.insertAdjacentHTML('beforeend', `
    <div class="script-loader-modal" id="script-loader-modal" hidden>
      <div class="script-loader-backdrop" data-loader-close="1"></div>
      <section class="script-loader-dialog" role="dialog" aria-modal="true" aria-labelledby="script-loader-title">
        <header class="script-loader-dialog-head">
          <div><p class="eyebrow">SCRIPT DELIVERY</p><h3 id="script-loader-title">Loader</h3></div>
          <button class="ghost-button small" type="button" data-loader-close="1">Close</button>
        </header>
        <div class="script-loader-mode-row">
          <span class="loader-mode-badge" id="script-loader-mode">—</span>
          <span class="muted" id="script-loader-note"></span>
        </div>
        <textarea id="script-loader-output" class="script-loader-output" spellcheck="false" readonly></textarea>
        <div class="script-loader-actions">
          <button class="primary-button" type="button" id="script-loader-copy">Copy loader</button>
          <button class="ghost-button" type="button" id="script-loader-download">Download .lua</button>
        </div>
      </section>
    </div>`);
}

function showModal(root, mode, source, note = '') {
  const modal = root.querySelector('#script-loader-modal');
  const output = root.querySelector('#script-loader-output');
  const modeNode = root.querySelector('#script-loader-mode');
  const noteNode = root.querySelector('#script-loader-note');
  modeNode.textContent = mode;
  modeNode.dataset.mode = mode === 'Embedded Loader' ? 'embedded' : 'key';
  noteNode.textContent = note;
  output.value = source;
  modal.hidden = false;
  output.focus();
}

export function installLoaderControls(root, api) {
  installModal(root);

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.dataset.loaderClose) {
      root.querySelector('#script-loader-modal').hidden = true;
      return;
    }

    const embeddedId = button.dataset.embeddedLoader;
    const keyLoaderId = button.dataset.keyLoader;
    if (!embeddedId && !keyLoaderId) return;

    const scriptId = embeddedId || keyLoaderId;
    button.disabled = true;
    const previousText = button.textContent;
    button.textContent = embeddedId ? 'Generating…' : 'Generating…';

    try {
      if (embeddedId) {
        const data = await api(`/scripts/${encodeURIComponent(scriptId)}/embedded-loader`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        showModal(root, 'Embedded Loader', data.source, 'No plaintext script key is embedded. Server-side license/HWID authorization remains active.');
      } else {
        const options = await api('/key-control/options');
        const scriptRow = button.closest('.script-row');
        const serviceId = scriptRow?.dataset.serviceId || button.dataset.serviceId;
        const providers = (options.providers ?? []).filter((item) => String(item.service_id || '') === String(serviceId || ''));
        if (!providers.length) throw new Error('No active provider is linked to this script service.');
        const provider = providers[0];
        const keyData = await api('/key-control/keys', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider_id: provider.id,
            service_id: serviceId,
            key_name: `${scriptRow?.querySelector('strong')?.textContent || 'Script'} key`,
            days: 30,
            hours: 0,
            minutes: 0,
            max_devices: 1,
            forever: false,
          }),
        });
        const loaderUrl = `/loader/${encodeURIComponent(scriptId)}?bootstrap=1&key=${encodeURIComponent(keyData.license_key)}`;
        const response = await fetch(loaderUrl, { credentials: 'include', cache: 'no-store' });
        const source = await response.text();
        if (!response.ok) throw new Error(source || `Loader generation failed (${response.status})`);
        showModal(root, 'Key Loader', source, 'This mode uses a normal license key. It remains separate from Embedded Loader.');
      }
    } catch (error) {
      const message = root.querySelector('#script-message');
      if (message) {
        message.hidden = false;
        message.textContent = error.message || 'Unable to generate loader.';
        message.classList.add('error');
      }
    } finally {
      button.disabled = false;
      button.textContent = previousText;
    }
  });

  root.querySelector('#script-loader-copy').addEventListener('click', async () => {
    const output = root.querySelector('#script-loader-output');
    try {
      await navigator.clipboard.writeText(output.value);
      root.querySelector('#script-loader-copy').textContent = 'Copied';
      setTimeout(() => { root.querySelector('#script-loader-copy').textContent = 'Copy loader'; }, 1000);
    } catch {
      output.select();
      document.execCommand('copy');
    }
  });

  root.querySelector('#script-loader-download').addEventListener('click', () => {
    const mode = root.querySelector('#script-loader-mode').dataset.mode === 'embedded' ? 'embedded' : 'key';
    const source = root.querySelector('#script-loader-output').value;
    const blob = new Blob([source], { type: 'text/x-lua;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `frezen-${mode}-loader.lua`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  });
}

export function injectLoaderButtons(root) {
  root.querySelectorAll('.script-row').forEach((row) => {
    const actions = row.querySelector('.script-actions');
    if (!actions || actions.dataset.loaderControls === '1') return;
    actions.dataset.loaderControls = '1';
    const scriptId = row.querySelector('[data-key]')?.dataset.key || row.querySelector('[data-upload]')?.dataset.upload;
    const match = row.querySelector('[data-script-service]')?.dataset.scriptService;
    const serviceId = row.dataset.serviceId || match || '';
    if (!scriptId) return;
    actions.insertAdjacentHTML('afterbegin', `
      <button class="ghost-button small loader-button" data-key-loader="${escapeHtml(scriptId)}" data-service-id="${escapeHtml(serviceId)}" type="button">Key Loader</button>
      <button class="primary-button small loader-button" data-embedded-loader="${escapeHtml(scriptId)}" type="button">Embedded Loader</button>`);
  });
}
