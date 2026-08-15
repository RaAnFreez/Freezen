const normalize = (value) => String(value ?? '').trim();

function patchCheckpointEditor() {
  const modal = document.querySelector('.safelinku-modal');
  if (!modal || modal.dataset.checkpointEnhanced === '1') return;
  const nameInput = modal.querySelector('#checkpoint-name');
  const refInput = modal.querySelector('#checkpoint-ref');
  if (!nameInput || !refInput) return;

  const refLabel = refInput.closest('.safelinku-field')?.querySelector('.safelinku-label');
  if (refLabel) refLabel.textContent = 'SafeLinkU checkpoint URL';
  refInput.placeholder = 'https://safelinku.com/...';
  refInput.type = 'url';
  refInput.setAttribute('inputmode', 'url');
  refInput.setAttribute('autocomplete', 'off');

  const note = modal.querySelector('.safelinku-note');
  if (note) {
    note.textContent = 'Paste the real checkpoint URL produced by your SafeLinkU integration. Provider Test will open this exact website after validating the SafeLinkU connection.';
  }

  const form = modal.querySelector('form');
  if (form) {
    form.addEventListener('submit', (event) => {
      const value = normalize(refInput.value);
      if (!/^https:\/\//i.test(value)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        refInput.setCustomValidity('Use the HTTPS SafeLinkU checkpoint URL.');
        refInput.reportValidity();
        setTimeout(() => refInput.setCustomValidity(''), 0);
      }
    }, true);
  }
  modal.dataset.checkpointEnhanced = '1';
}

const observer = new MutationObserver(patchCheckpointEditor);
observer.observe(document.body, { childList: true, subtree: true });
patchCheckpointEditor();
