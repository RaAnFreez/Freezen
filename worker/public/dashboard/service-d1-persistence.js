(() => {
  const SERVICE_KEY = 'frezen.services.v1';
  const PROVIDER_KEY = 'frezen.providers.v1';
  let replaying = false;

  const sync = async () => {
    try {
      if (window.FrezenIntegration?.syncToServer) {
        await window.FrezenIntegration.syncToServer(true);
      }
    } catch (error) {
      console.warn('Frezen state sync failed', error);
      throw error;
    }
  };

  const guardClick = (selector) => {
    document.addEventListener('click', async (event) => {
      const target = event.target?.closest?.(selector);
      if (!target || replaying) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      try {
        await sync();
        replaying = true;
        target.click();
      } catch {
        alert('Unable to save the current dashboard state. Please refresh and try again.');
      } finally {
        replaying = false;
      }
    }, true);
  };

  // A newly-created Service/Provider must reach D1 before another panel reads options.
  guardClick('#lua-create');
  guardClick('[data-frezen-generate-key]');

  // Service/Provider edits and deletes are completed by their existing handlers first;
  // any resulting localStorage mutation is synchronized immediately afterwards.
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const schedule = (key) => {
    if (key !== SERVICE_KEY && key !== PROVIDER_KEY) return;
    queueMicrotask(() => { sync().catch(() => {}); });
  };

  Storage.prototype.setItem = function(key, value) {
    const result = originalSetItem.call(this, key, value);
    schedule(key);
    return result;
  };
  Storage.prototype.removeItem = function(key) {
    const result = originalRemoveItem.call(this, key);
    schedule(key);
    return result;
  };
})();
