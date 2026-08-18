(() => {
  const INTERNAL_NOTE = 'Frezen uses its own keyed loader. No external loader service is configured by default.';

  function loaderSource(scriptId) {
    const endpoint = `${location.origin}/loader/${encodeURIComponent(scriptId)}`;
    return [
      'script_key="PASTE YOUR KEY HERE";',
      'local HttpService=game:GetService("HttpService");',
      `local source=game:HttpGet("${endpoint}?key="..HttpService:UrlEncode(script_key));`,
      'loadstring(source)();',
    ].join('\n');
  }

  function patchCreateModal() {
    const loader = document.querySelector('#lua-loader');
    if (!loader) return;
    loader.value = '';
    loader.placeholder = 'Frezen internal keyed loader';
    const field = loader.closest('.lua-field');
    if (field) {
      field.style.display = 'none';
      const note = field.querySelector('.lua-source-note');
      if (note) note.textContent = INTERNAL_NOTE;
    }
  }

  // Do not observe the whole dashboard DOM. The old global MutationObserver fired on
  // every table update and made the Create Script modal increasingly expensive.
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-act="loader"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const scriptId = button.dataset.id;
    if (!scriptId) return;
    const source = loaderSource(scriptId);
    navigator.clipboard?.writeText(source)
      .then(() => alert('Frezen keyed loader copied. Replace PASTE YOUR KEY HERE with a valid key.'))
      .catch(() => alert(source));
  }, true);

  // Patch only when the modal is explicitly opened.
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-act="create-script"], [data-act="new-script"], #create-script, #new-script')) {
      queueMicrotask(patchCreateModal);
    }
  });
})();
