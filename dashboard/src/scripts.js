import "./scripts.css";

const API = "/api/v1";

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { credentials: "include", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `Request failed (${response.status})`);
  return data;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
}

export function renderScripts(root) {
  root.innerHTML = `
    <section class="panel scripts-page">
      <div class="panel-heading"><div><p class="eyebrow">LUA SCRIPT MANAGER</p><h2>Scripts</h2></div><button class="primary-button" id="script-refresh">Refresh</button></div>
      <p class="muted">Upload Lua files as data only. Frezen never executes uploaded Lua on the server.</p>
      <div class="script-form">
        <label>Service<select id="script-service"><option value="">Loading services…</option></select></label>
        <label>Script name<input id="script-name" maxlength="120" placeholder="MyScript.lua" /></label>
        <label>Description<textarea id="script-description" maxlength="1000" rows="2" placeholder="Optional description"></textarea></label>
        <button class="primary-button" id="script-create">Create script</button>
      </div>
      <div class="script-toolbar"><input id="script-search" placeholder="Search scripts…" /><select id="script-status"><option value="">All status</option><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select></div>
      <div id="script-message" class="inline-message" hidden></div>
      <div id="script-list" class="script-list"><div class="empty"><span>◌</span><strong>Loading scripts…</strong></div></div>
    </section>`;

  const list = root.querySelector("#script-list");
  const message = root.querySelector("#script-message");
  const serviceSelect = root.querySelector("#script-service");
  const showMessage = (text, error = false) => { message.hidden = !text; message.textContent = text; message.classList.toggle("error", error); };

  const loadServices = async () => {
    const data = await api("/key-control/options");
    serviceSelect.innerHTML = (data.services ?? []).map((service) => `<option value="${esc(service.id)}">${esc(service.name)}</option>`).join("") || `<option value="">No services configured</option>`;
  };

  const generateKeyForScript = async (script) => {
    const options = await api("/key-control/options");
    const providers = (options.providers ?? []).filter((item) => String(item.service_id || "") === String(script.service_id));
    if (!providers.length) throw new Error("No active provider is linked to this script's service. Configure a provider for this service first.");
    const provider = providers[0];
    const data = await api("/key-control/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider_id: provider.id,
        service_id: script.service_id,
        key_name: `${script.name} key`,
        days: 30,
        hours: 0,
        minutes: 0,
        max_devices: 1,
        forever: false,
      }),
    });
    return { key: data.license_key, provider };
  };

  const load = async () => {
    try {
      const params = new URLSearchParams({ page: "1", page_size: "50" });
      const q = root.querySelector("#script-search").value.trim();
      const status = root.querySelector("#script-status").value;
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const data = await api(`/scripts?${params}`);
      if (!data.scripts?.length) { list.innerHTML = `<div class="empty"><span>◌</span><strong>No scripts found</strong><p>Create a script record before uploading a Lua version.</p></div>`; return; }
      list.innerHTML = data.scripts.map((script) => `
        <article class="script-row">
          <div><strong>${esc(script.name)}</strong><small>${esc(script.service_name || script.service_id)} · ${script.version_count} version(s)</small></div>
          <span class="product-status">${esc(script.status)}</span>
          <span class="product-version">${esc(script.active_version || "No active version")}</span>
          <div class="script-actions"><button class="ghost-button small" data-key="${esc(script.id)}">Generate Key</button><button class="ghost-button small" data-upload="${esc(script.id)}">Upload Lua</button><button class="ghost-button small" data-disable="${esc(script.id)}">${script.status === "ACTIVE" ? "Disable" : "Enable"}</button><button class="danger-button small" data-delete="${esc(script.id)}">Delete</button></div>
          <div class="script-upload" data-panel="${esc(script.id)}" hidden><input type="file" accept=".lua,text/x-lua" data-file="${esc(script.id)}" /><input placeholder="Version e.g. 1.0.0" data-version="${esc(script.id)}" maxlength="80" /><input placeholder="Release notes (optional)" data-notes="${esc(script.id)}" maxlength="2000" /><button class="primary-button small" data-submit-upload="${esc(script.id)}">Upload</button></div>
        </article>`).join("");

      const detailById = new Map(data.scripts.map((script) => [String(script.id), script]));
      list.querySelectorAll("[data-key]").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const script = detailById.get(String(button.dataset.key));
          if (!script) throw new Error("Script not found in current list.");
          const result = await generateKeyForScript(script);
          showMessage(`Key created for ${script.name}: ${result.key}`);
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          button.disabled = false;
        }
      }));
    } catch (error) { list.innerHTML = `<div class="empty"><strong>Unable to load scripts</strong><p>${esc(error.message)}</p></div>`; }
  };

  root.querySelector("#script-refresh").addEventListener("click", async () => { try { await loadServices(); await load(); } catch (error) { showMessage(error.message, true); } });
  root.querySelector("#script-search").addEventListener("input", load);
  root.querySelector("#script-status").addEventListener("change", load);

  root.querySelector("#script-create").addEventListener("click", async () => {
    try {
      if (!serviceSelect.value) throw new Error("Create a key service before creating a script.");
      await api("/scripts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ service_id: serviceSelect.value, name: root.querySelector("#script-name").value.trim(), description: root.querySelector("#script-description").value.trim() }) });
      showMessage("Script created.");
      root.querySelector("#script-name").value = "";
      root.querySelector("#script-description").value = "";
      await load();
    } catch (error) { showMessage(error.message, true); }
  });

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || button.dataset.key) return;
    try {
      if (button.dataset.upload) { const panel = root.querySelector(`[data-panel="${CSS.escape(button.dataset.upload)}"]`); panel.hidden = !panel.hidden; return; }
      if (button.dataset.disable) {
        const script = (await api(`/scripts/${encodeURIComponent(button.dataset.disable)}`)).script;
        await api(`/scripts/${encodeURIComponent(button.dataset.disable)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: script.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }) });
        showMessage("Script status updated."); await load(); return;
      }
      if (button.dataset.delete && confirm("Delete this script and its stored versions?")) { await api(`/scripts/${encodeURIComponent(button.dataset.delete)}`, { method: "DELETE" }); showMessage("Script deleted."); await load(); return; }
      if (button.dataset.submitUpload) {
        const id = button.dataset.submitUpload;
        const file = root.querySelector(`[data-file="${CSS.escape(id)}"]`).files[0];
        const version = root.querySelector(`[data-version="${CSS.escape(id)}"]`).value.trim();
        const notes = root.querySelector(`[data-notes="${CSS.escape(id)}"]`).value.trim();
        if (!file) throw new Error("Select a .lua file first.");
        const form = new FormData(); form.append("file", file); form.append("version", version); form.append("release_notes", notes);
        await api(`/scripts/${encodeURIComponent(id)}/versions`, { method: "POST", body: form });
        showMessage("Lua version uploaded. Activate it from the version control endpoint when ready."); await load(); return;
      }
    } catch (error) { showMessage(error.message, true); }
  });

  (async () => { try { await loadServices(); await load(); } catch (error) { showMessage(error.message, true); } })();
}
