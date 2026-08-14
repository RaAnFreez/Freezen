// Frezen Core Controls focus mode.
// Keeps the existing dashboard/router and feature implementations intact while
// presenting only the four controls currently in scope.
(() => {
  const CORE = new Map([
    ['licenses', ['Key Control', '◇']],
    ['hwid', ['HWID Control', '⌘']],
    ['scripts', ['Script Control', '{}']],
    ['safelinku', ['SafeLinkU', '↗']],
  ]);

  function apply() {
    const nav = document.querySelector('#nav');
    if (!nav) return false;
    nav.querySelectorAll('.nav-item').forEach((button) => {
      const id = button.dataset.section;
      const keep = CORE.has(id);
      button.hidden = !keep;
      if (keep) {
        const [label, glyph] = CORE.get(id);
        const text = button.querySelector('span');
        const icon = button.querySelector('i');
        if (text) text.textContent = label;
        if (icon) icon.textContent = glyph;
        button.title = label;
      }
    });

    const title = document.querySelector('#title');
    if (title && title.textContent === 'Licenses') title.textContent = 'Key Control';
    return true;
  }

  if (!apply()) {
    const timer = setInterval(() => { if (apply()) clearInterval(timer); }, 25);
    setTimeout(() => clearInterval(timer), 5000);
  }
})();
