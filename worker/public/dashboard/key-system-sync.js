(() => {
  const boot = async () => {
    try {
      if (window.FrezenIntegration?.hydrate) {
        await window.FrezenIntegration.hydrate();
        return;
      }
      await fetch('/api/v1/key-system/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ services: [], providers: [], checkpoints: [] }),
      });
    } catch {}
  };
  boot();
})();
