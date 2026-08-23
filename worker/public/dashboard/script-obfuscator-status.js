(() => {
  const ID = 'frezen-script-obfuscation-status';
  const CSS_ID = `${ID}-style`;

  function style() {
    if (document.getElementById(CSS_ID)) return;
    const node = document.createElement('style');
    node.id = CSS_ID;
    node.textContent = `
      #${ID}{margin:0 0 16px;padding:12px 14px;border:1px solid rgba(168,92,255,.28);border-radius:12px;background:linear-gradient(180deg,rgba(92,37,126,.22),rgba(26,17,34,.88));color:#eee7f7;font-size:12px;line-height:1.45}
      #${ID} strong{color:#fff}
      #${ID} .meta{display:inline-flex;gap:6px;flex-wrap:wrap;margin-top:7px}
      #${ID} .pill{padding:4px 8px;border-radius:999px;border:1px solid rgba(181,108,255,.28);background:rgba(109,45,160,.22);color:#dfc4ff;font-size:10px;font-weight:800}
    `;
    document.head.appendChild(node);
  }

  function mount(modal) {
    if (!modal || modal.querySelector(`#${ID}`)) return;
    const body = modal.querySelector('.lua-modal-body');
    if (!body) return;
    style();
    const box = document.createElement('div');
    box.id = ID;
    box.innerHTML = '<strong>Automatic protection enabled</strong><br>Every new Lua upload and version is transformed server-side before it is stored and delivered by the loader. Source Lua is not used for runtime delivery.' +
      '<div class="meta"><span class="pill">Advanced Techniques v1.1</span><span class="pill">Very High</span><span class="pill">Protection 100%</span><span class="pill">XOR string encoding</span></div>';
    body.prepend(box);
  }

  function scan() {
    document.querySelectorAll('.lua-modal').forEach(mount);
  }

  style();
  scan();
  document.addEventListener('DOMContentLoaded', scan, { once: true });
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
