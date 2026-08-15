const KEYS = ['frezen.services.v1', 'frezen.providers.v1', 'frezen.safelinku.checkpoints.v1'];
let timer = null;
let busy = false;

function read(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

async function sync() {
  if (busy) return;
  busy = true;
  try {
    await fetch('/api/v1/key-system/sync', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        services: read(KEYS[0]),
        providers: read(KEYS[1]),
        checkpoints: read(KEYS[2]),
      }),
    });
  } catch {}
  finally { busy = false; }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(sync, 150);
}

const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;
Storage.prototype.setItem = function(key, value) {
  const result = originalSetItem.call(this, key, value);
  if (KEYS.includes(key)) schedule();
  return result;
};
Storage.prototype.removeItem = function(key) {
  const result = originalRemoveItem.call(this, key);
  if (KEYS.includes(key)) schedule();
  return result;
};

window.addEventListener('storage', (event) => { if (KEYS.includes(event.key)) schedule(); });
sync();
