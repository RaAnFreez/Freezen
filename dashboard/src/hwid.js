import "./hwid.css";

const API = "/api/v1";
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";

export function renderHwid(container) {
  container.innerHTML = `
    <section class="panel hwid-panel">
      <div class="hwid-header">
        <div class="hwid-title-wrap">
          <div class="hwid-icon">♧</div>
          <div><p class="eyebrow">HWID CONTROL</p><h2>HWID blacklist</h2><p class="muted">Devices are added automatically when a valid key is used by the script loader.</p></div>
        </div>
        <button class="primary-button hwid-ban-button" id="hwid-ban">＋ Ban</button>
      </div>

      <div class="hwid-stats">
        <div><span>Total devices</span><strong id="hwid-total">0</strong></div>
        <div><span>Active</span><strong id="hwid-active">0</strong></div>
        <div><span>Blocked</span><strong id="hwid-blocked">0</strong></div>
      </div>

      <div id="hwid-message" class="inline-message" hidden></div>
      <div id="hwid-list" class="hwid-list">
        <div class="hwid-empty"><div class="hwid-empty-icon">♧</div><strong>Loading HWIDs…</strong><p>Device activity will appear here automatically.</p></div>
      </div>
    </section>`;

  const list = container.querySelector("#hwid-list");
  const message = container.querySelector("#hwid-message");
  const total = container.querySelector("#hwid-total");
  const active = container.querySelector("#hwid-active");
  const blocked = container.querySelector("#hwid-blocked");
  const show = (text, error = false) => { message.hidden = !text; message.textContent = text; message.classList.toggle("error", error); };

  const api = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { credentials: "include", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
    return data;
  };

  const render = (devices) => {
    if (!devices.length) {
      list.innerHTML = `<div class="hwid-empty"><div class="hwid-empty-icon">♧</div><strong>No HWIDs banned yet</strong><p>Banned hardware IDs will appear here. Valid key usage will automatically create device records.</p></div>`;
      return;
    }

    list.innerHTML = `
      <div class="hwid-table-wrap"><table class="hwid-table"><thead><tr><th>Device</th><th>Key</th><th>Service</th><th>Status</th><th>Last seen</th><th>Expires</th><th></th></tr></thead><tbody>
      ${devices.map((device) => {
        const isBlocked = device.status === "blocked";
        return `<tr>
          <td><div class="device-cell"><span class="device-dot ${isBlocked ? "blocked" : "active"}"></span><div><code>${escapeHtml(device.fingerprint || device.id.slice(0, 12))}</code><small>${escapeHtml(device.id)}</small></div></div></td>
          <td>${escapeHtml(device.key_name || device.license_id)}</td>
          <td>${escapeHtml(device.service_name || device.service_id || "—")}</td>
          <td><span class="hwid-status ${isBlocked ? "blocked" : "active"}">${isBlocked ? "BLOCKED" : "ACTIVE"}</span></td>
          <td>${escapeHtml(formatDate(device.last_seen || device.first_seen))}</td>
          <td>${escapeHtml(formatDate(device.expires_at))}</td>
          <td><button class="ghost-button small" data-device="${escapeHtml(device.id)}" data-next="${isBlocked ? "unblock" : "block"}">${isBlocked ? "Unblock" : "Block"}</button></td>
        </tr>`;
      }).join("")}
      </tbody></table></div>`;

    list.querySelectorAll("[data-device]").forEach((button) => button.addEventListener("click", () => toggle(button.dataset.device, button.dataset.next)));
  };

  const load = async () => {
    show("");
    list.innerHTML = `<div class="hwid-empty"><div class="hwid-empty-icon">◌</div><strong>Loading HWIDs…</strong><p>Refreshing device records.</p></div>`;
    try {
      const data = await api("/hwid/all");
      total.textContent = String(data.stats?.total ?? data.devices?.length ?? 0);
      active.textContent = String(data.stats?.active ?? 0);
      blocked.textContent = String(data.stats?.blocked ?? 0);
      render(data.devices ?? []);
    } catch (error) {
      list.innerHTML = `<div class="hwid-empty"><div class="hwid-empty-icon">!</div><strong>Unable to load HWIDs</strong><p>${escapeHtml(error.message)}</p></div>`;
      show(error.message, true);
    }
  };

  const toggle = async (deviceId, next) => {
    if (!window.confirm(`${next === "block" ? "Ban" : "Unban"} this device?`)) return;
    try {
      await api(`/hwid/devices/${encodeURIComponent(deviceId)}/${next}`, { method: "PATCH" });
      show(`Device ${next === "block" ? "banned" : "unblocked"}.`);
      await load();
    } catch (error) { show(error.message, true); }
  };

  container.querySelector("#hwid-ban").addEventListener("click", async () => {
    const deviceId = window.prompt("Enter the device ID to ban:");
    if (!deviceId?.trim()) return;
    await toggle(deviceId.trim(), "block");
  });

  load();
}
