import "./keys.css";

const API = "/api/v1/key-control";
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const date = (value) => value ? new Date(value).toLocaleString() : "Forever";

export function renderKeys(root) {
  root.innerHTML = `
    <section class="panel keys-panel">
      <div class="keys-heading"><div><p class="eyebrow">KEY CONTROL</p><h2>License Keys</h2><p class="muted">Create, inspect and delete keys. Expired keys are removed automatically.</p></div><button class="ghost-button" id="key-refresh">Refresh</button></div>
      <div id="key-message" class="inline-message" hidden></div>
      <div class="key-create-card">
        <div class="key-create-title"><strong>Create key</strong><span>Each key can have its own device limit and validity.</span></div>
        <div class="key-form-grid">
          <label>Provider<select id="key-provider"></select></label>
          <label>Service<select id="key-service"><option value="">Use provider service</option></select></label>
          <label>Folder<select id="key-folder"><option value="">No folder</option></select></label>
          <label>Key name<input id="key-name" maxlength="100" placeholder="Customer / VIP"></label>
          <label>Days<input id="key-days" type="number" min="0" max="3650" value="30"></label>
          <label>Hours<input id="key-hours" type="number" min="0" max="87600" value="0"></label>
          <label>Minutes<input id="key-minutes" type="number" min="0" max="5256000" value="0"></label>
          <label>Max devices<input id="key-devices" type="number" min="1" max="100" value="1"></label>
        </div>
        <label class="key-check"><input id="key-forever" type="checkbox"><span>Forever key</span></label>
        <button class="primary-button" id="key-create">Create key</button>
      </div>
      <div id="key-list" class="key-list"><div class="key-empty"><strong>Loading keys…</strong></div></div>
    </section>`;

  const list = root.querySelector("#key-list");
  const message = root.querySelector("#key-message");
  const provider = root.querySelector("#key-provider");
  const service = root.querySelector("#key-service");
  const folder = root.querySelector("#key-folder");
  const forever = root.querySelector("#key-forever");
  const show = (text, error = false) => { message.hidden = !text; message.textContent = text; message.classList.toggle("error", error); };
  let providerOptions = [];

  const api = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { credentials: "include", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
    return data;
  };

  const syncProviderService = () => {
    const selected = providerOptions.find((item) => String(item.id) === String(provider.value));
    const boundService = selected?.service_id ? String(selected.service_id) : "";
    if (boundService) {
      service.value = boundService;
      service.disabled = true;
    } else {
      service.value = "";
      service.disabled = false;
    }
  };

  const loadOptions = async () => {
    const data = await api("/options");
    providerOptions = data.providers ?? [];
    provider.innerHTML = providerOptions.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("") || `<option value="">No providers</option>`;
    service.innerHTML = `<option value="">Use provider service</option>` + (data.services ?? []).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
    folder.innerHTML = `<option value="">No folder</option>` + (data.folders ?? []).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
    syncProviderService();
  };

  const render = (keys) => {
    if (!keys.length) { list.innerHTML = `<div class="key-empty"><div class="key-empty-icon">⌁</div><strong>No keys yet</strong><p>Create a key above. Expired keys disappear automatically.</p></div>`; return; }
    list.innerHTML = keys.map((key) => `
      <article class="key-card">
        <div class="key-main"><div class="key-mark">⌁</div><div><strong>${esc(key.key_name || "Unnamed key")}</strong><small>${esc(key.license_id)}</small></div></div>
        <div class="key-meta"><span>${esc(key.service_name || "No service")}</span><span>${Number(key.max_devices ?? 1)} device${Number(key.max_devices ?? 1) === 1 ? "" : "s"}</span><span>${key.forever ? "FOREVER" : `Expires ${esc(date(key.expires_at))}`}</span></div>
        <div class="key-actions"><button class="danger-button small" data-delete="${esc(key.id)}">Delete</button></div>
      </article>`).join("");
    list.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => removeKey(button.dataset.delete)));
  };

  const load = async () => {
    try { const data = await api("/keys?page=1&page_size=100"); render(data.keys ?? []); } catch (error) { list.innerHTML = `<div class="key-empty"><strong>Unable to load keys</strong><p>${esc(error.message)}</p></div>`; show(error.message, true); }
  };

  const removeKey = async (id) => {
    if (!window.confirm("Delete this key? This cannot be undone.")) return;
    try { await api(`/keys/${encodeURIComponent(id)}`, { method: "DELETE" }); show("Key deleted."); await load(); } catch (error) { show(error.message, true); }
  };

  provider.addEventListener("change", syncProviderService);

  root.querySelector("#key-create").addEventListener("click", async () => {
    if (!provider.value) { show("Create or enable a provider first.", true); return; }
    try {
      syncProviderService();
      const body = {
        provider_id: provider.value,
        service_id: service.value || null,
        folder_id: folder.value || null,
        key_name: root.querySelector("#key-name").value.trim() || null,
        days: Number(root.querySelector("#key-days").value || 0),
        hours: Number(root.querySelector("#key-hours").value || 0),
        minutes: Number(root.querySelector("#key-minutes").value || 0),
        max_devices: Number(root.querySelector("#key-devices").value || 1),
        forever: forever.checked,
      };
      const data = await api("/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const createdKey = data.license_key || "";
      show(createdKey ? `Key created: ${createdKey}` : "Key created.");
      root.querySelector("#key-name").value = "";
      await load();
    } catch (error) { show(error.message, true); }
  });

  root.querySelector("#key-refresh").addEventListener("click", async () => { try { await loadOptions(); await load(); } catch (error) { show(error.message, true); } });
  forever.addEventListener("change", () => { ["#key-days", "#key-hours", "#key-minutes"].forEach((selector) => { root.querySelector(selector).disabled = forever.checked; }); });

  (async () => { try { await loadOptions(); await load(); } catch (error) { show(error.message, true); } })();
}
