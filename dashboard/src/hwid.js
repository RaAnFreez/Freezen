import "./hwid.css";

const API = "/api/v1";
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";

export function renderHwid(container) {
  container.innerHTML = `
    <section class="panel hwid-panel">
      <div class="panel-heading"><div><p class="eyebrow">PHASE 16</p><h2>HWID Management</h2><p class="muted">Bind, validate, reset and control authorized devices without exposing raw HWIDs.</p></div><button class="ghost-button" id="hwid-refresh">Refresh</button></div>
      <div class="hwid-form">
        <label class="field"><span>License ID</span><input id="hwid-license" maxlength="128" placeholder="License UUID"></label>
        <label class="field"><span>HWID</span><input id="hwid-value" maxlength="512" placeholder="Device identifier"></label>
        <div class="hwid-buttons"><button class="primary-button" id="hwid-bind">Bind device</button><button class="ghost-button" id="hwid-validate">Validate</button><button class="danger-button" id="hwid-reset">Reset license HWID</button></div>
      </div>
      <div id="hwid-message" class="inline-message" hidden></div>
      <div id="hwid-list" class="table-wrap"><div class="empty"><strong>Enter a license ID</strong><p>Only device metadata is displayed. Raw HWIDs are hashed server-side.</p></div></div>
    </section>`;

  const license = container.querySelector("#hwid-license");
  const hwid = container.querySelector("#hwid-value");
  const list = container.querySelector("#hwid-list");
  const message = container.querySelector("#hwid-message");
  const show = (text, error = false) => { message.hidden = !text; message.textContent = text; message.classList.toggle("error", error); };
  const headers = { "content-type": "application/json" };

  const load = async () => {
    const id = license.value.trim();
    if (!id) return;
    try {
      const response = await fetch(`${API}/hwid?license_id=${encodeURIComponent(id)}`, { credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
      renderDevices(data.devices ?? []);
    } catch (error) { show(error.message, true); }
  };

  const renderDevices = (devices) => {
    if (!devices.length) { list.innerHTML = `<div class="empty"><strong>No devices bound</strong><p>Bind a device to this license to create its server-side HWID record.</p></div>`; return; }
    list.innerHTML = `<table><thead><tr><th>Device</th><th>Status</th><th>First seen</th><th>Last seen</th><th>Blocked</th><th></th></tr></thead><tbody>${devices.map((device) => `<tr><td><code>${escapeHtml(device.id)}</code></td><td><span class="status-pill status-${device.status === "active" ? "active" : "banned"}">${escapeHtml(device.status.toUpperCase())}</span></td><td>${escapeHtml(formatDate(device.first_seen))}</td><td>${escapeHtml(formatDate(device.last_seen))}</td><td>${escapeHtml(device.blocked_reason ?? "—")}</td><td><button class="ghost-button small" data-device="${escapeHtml(device.id)}" data-next="${device.status === "active" ? "block" : "unblock"}">${device.status === "active" ? "Block" : "Unblock"}</button></td></tr>`).join("")}</tbody></table>`;
    list.querySelectorAll("[data-device]").forEach((button) => button.addEventListener("click", () => toggleDevice(button.dataset.device, button.dataset.next)));
  };

  const action = async (path, method, body = null) => {
    const response = await fetch(`${API}${path}`, { method, credentials: "include", headers: body ? headers : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
    return data;
  };

  const bind = async () => {
    try { const data = await action("/hwid", "POST", { license_id: license.value.trim(), hwid: hwid.value }); show(data.existing ? "Device already bound; last seen updated." : "Device bound successfully."); await load(); } catch (error) { show(error.message, true); }
  };
  const validate = async () => {
    try { const data = await action("/hwid/validate", "POST", { license_id: license.value.trim(), hwid: hwid.value }); show(data.valid ? "HWID validation passed." : `HWID validation denied: ${data.reason}`, !data.valid); await load(); } catch (error) { show(error.message, true); }
  };
  const reset = async () => {
    if (!license.value.trim() || !window.confirm("Reset all active devices for this license? A cooldown will be applied.")) return;
    try { const data = await action(`/hwid/licenses/${encodeURIComponent(license.value.trim())}/reset`, "POST"); show(`HWID reset. Next reset available at ${formatDate(data.available_at)}.`); await load(); } catch (error) { show(error.message, true); }
  };
  const toggleDevice = async (deviceId, next) => {
    if (!window.confirm(`${next === "block" ? "Block" : "Unblock"} this device?`)) return;
    try { await action(`/hwid/devices/${encodeURIComponent(deviceId)}/${next}`, "PATCH"); show(`Device ${next}ed.`); await load(); } catch (error) { show(error.message, true); }
  };

  container.querySelector("#hwid-bind").addEventListener("click", bind);
  container.querySelector("#hwid-validate").addEventListener("click", validate);
  container.querySelector("#hwid-reset").addEventListener("click", reset);
  container.querySelector("#hwid-refresh").addEventListener("click", load);
}
