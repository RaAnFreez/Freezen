(() => {
  const goToHwid = () => {
    const button = document.querySelector('.nav-item[data-section="hwid"]');
    if (button) button.click();
  };

  const hideKeyHwidActions = () => {
    document.querySelectorAll('.key-control [data-action="hwid"]').forEach((button) => {
      button.hidden = true;
      button.setAttribute('aria-hidden', 'true');
      button.title = 'HWID management is available in the HWIDs panel';
    });
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.key-control [data-action="hwid"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    goToHwid();
  }, true);

  hideKeyHwidActions();
  const observer = new MutationObserver(hideKeyHwidActions);
  observer.observe(document.body, { childList: true, subtree: true });
})();
