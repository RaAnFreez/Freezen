import { renderSlugGetKeyPage as renderOriginalGetKeyPage } from './getkey-slug-ui-original.js';

const NO_STORE = { 'cache-control': 'no-store, no-cache, must-revalidate', pragma: 'no-cache' };

export async function renderSlugGetKeyPage(slug) {
  const original = renderOriginalGetKeyPage(slug);
  const html = await original.text();
  const injection = `<script>
(() => {
  const button = document.getElementById('copyKey');
  if (!button) return;
  const keyText = () => String(document.getElementById('keyValue')?.textContent || '').trim();
  const reset = () => window.setTimeout(() => {
    button.textContent = 'Copy Key';
    button.classList.remove('copied');
    button.disabled = false;
  }, 1800);
  const copyText = async () => {
    const value = keyText();
    if (!value || button.disabled) return;
    button.disabled = true;
    let copied = false;
    try {
      const helper = document.createElement('input');
      helper.type = 'text';
      helper.value = value;
      helper.readOnly = true;
      helper.setAttribute('aria-hidden', 'true');
      helper.style.position = 'fixed';
      helper.style.left = '0';
      helper.style.top = '0';
      helper.style.width = '1px';
      helper.style.height = '1px';
      helper.style.opacity = '0.01';
      helper.style.pointerEvents = 'none';
      document.body.appendChild(helper);
      helper.focus();
      helper.select();
      helper.setSelectionRange(0, helper.value.length);
      if (typeof document.execCommand === 'function') copied = document.execCommand('copy');
      helper.remove();
    } catch {}
    if (!copied) {
      try {
        if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(value);
          copied = true;
        }
      } catch {}
    }
    if (copied) {
      button.textContent = 'Key Copied';
      button.classList.add('copied');
      reset();
      return;
    }
    button.disabled = false;
    button.textContent = 'Copy Key';
  };
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    void copyText();
  }, true);
})();
</script>`;
  const body = html.replace('</body>', `${injection}</body>`);
  const headers = new Headers(original.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', NO_STORE['cache-control']);
  headers.set('pragma', NO_STORE.pragma);
  return new Response(body, { status: original.status, statusText: original.statusText, headers });
}
