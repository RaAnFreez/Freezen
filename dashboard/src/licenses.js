const API = "/api/v1";
const PAGE_SIZE = 10;
const STATUSES = ["", "unused", "active", "expired", "revoked", "banned"];

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";
const statusLabel = (status) => String(status ?? "unknown").toUpperCase();

export function renderLicenses(container) {
  const state = { page: 1, status: "", q: "", selected: null };
  container.innerHTML = `
    <section class="panel licenses-panel">
      <div class="panel-heading">
        <div><p class="eyebrow">PHASE 15</p><h2>License Management</h2><p class="muted">Search, filter, inspect and perform controlled license actions.</p></div>
        <button class="ghost-button" id="license-refresh">Refresh</button>
      </div>
      <div class="license-toolbar">
        <label class="field"><span>Search</span><input id="license-search" type="search" maxlength="128" placeholder="ID, user, email or product"></label>
        <label class="field"><span>Status</span><select id="license-status">${STATUSES.map((value) => `<option value="${value}">${value ? statusLabel(value) : "All statuses"}</option>`).join("")}</select></label>
      </div>
      <div id="license-message" class="inline-message" hidden></div>
      <div id="license-table" class="table-wrap"></div>
      <div id="license-pagination" class="pagination"></div>
    </section>
    <div id="license-detail" class="license-detail" hidden></div>
  `;

  const table = container.querySelector("#license-table");
  const pagination = container.querySelector("#license-pagination");
  const message = container.querySelector("#license-message");
  const search = container.querySelector("#license-search");
  const status = container.querySelector("#license-status");

  const showMessage = (text, error = false) => {
    message.hidden = !text;
    message.textContent = text;
    message.classList.toggle("error", error);
  };

  const load = async () => {
    showMessage("");
    const params = new URLSearchParams({ page: String(state.page), page_size: String(PAGE_SIZE) });
    if (state.status) params.set("status", state.status);
    if (state.q) params.set("q", state.q);
    table.innerHTML = `<div class="empty"><span>◌</span><strong>Loading licenses…</strong></div>`;
    try {
      const response = await fetch(`${API}/licenses?${params}`, { credentials: "include", headers: { accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
      renderTable(data.licenses ?? []);
      renderPagination(data.pagination ?? { page: state.page, total: 0, total_pages: 0 });
    } catch (error) {
      table.innerHTML = `<div class="empty"><span>!</span><strong>Unable to load licenses</strong><p>${escapeHtml(error.message)}</p></div>`;
      pagination.innerHTML = "";
      showMessage("The license list could not be loaded. Check the authenticated API session.", true);
    }
  };

  const renderTable = (licenses) => {
    if (!licenses.length) {
      table.innerHTML = `<div class="empty"><span>◇</span><strong>No licenses found</strong><p>Try another search or status filter.</p></div>`;
      return;
    }
    table.innerHTML = `<table><thead><tr><th>License</th><th>Product</th><th>User</th><th>Status</th><th>Expires</th><th>Created</th><th></th></tr></thead><tbody>${licenses.map((license) => `
      <tr>
        <td><code>${escapeHtml(license.id)}</code></td>
        <td>${escapeHtml(license.product_name ?? license.product_id)}</td>
        <td>${escapeHtml(license.username ?? license.email ?? "Unassigned")}</td>
        <td><span class="status-pill status-${escapeHtml(license.status)}">${escapeHtml(statusLabel(license.status))}</span></td>
        <td>${escapeHtml(formatDate(license.expires_at))}</td>
        <td>${escapeHtml(formatDate(license.created_at))}</td>
        <td><button class="ghost-button small" data-license-detail="${escapeHtml(license.id)}">Details</button></td>
      </tr>`).join("")}</tbody></table>`;
    table.querySelectorAll("[data-license-detail]").forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.licenseDetail)));
  };

  const renderPagination = (paginationData) => {
    const totalPages = Number(paginationData.total_pages ?? 0);
    const current = Number(paginationData.page ?? state.page);
    pagination.innerHTML = `<span>${paginationData.total ?? 0} license${paginationData.total === 1 ? "" : "s"}</span><div><button class="ghost-button small" id="license-prev" ${current <= 1 ? "disabled" : ""}>Previous</button><span>Page ${totalPages ? current : 0} / ${totalPages}</span><button class="ghost-button small" id="license-next" ${!totalPages || current >= totalPages ? "disabled" : ""}>Next</button></div>`;
    pagination.querySelector("#license-prev")?.addEventListener("click", () => { state.page -= 1; load(); });
    pagination.querySelector("#license-next")?.addEventListener("click", () => { state.page += 1; load(); });
  };

  const openDetail = async (licenseId) => {
    const detail = container.querySelector("#license-detail");
    detail.hidden = false;
    detail.innerHTML = `<section class="panel"><div class="empty"><span>◌</span><strong>Loading license detail…</strong></div></section>`;
    try {
      const [licenseResponse, auditResponse] = await Promise.all([
        fetch(`${API}/licenses/${encodeURIComponent(licenseId)}`, { credentials: "include" }),
        fetch(`${API}/licenses/${encodeURIComponent(licenseId)}/audit`, { credentials: "include" }),
      ]);
      const licenseData = await licenseResponse.json().catch(() => ({}));
      const auditData = await auditResponse.json().catch(() => ({}));
      if (!licenseResponse.ok) throw new Error(licenseData.error ?? "License not found");
      state.selected = licenseData.license;
      const license = state.selected;
      const audit = auditData.audit ?? auditData.events ?? [];
      detail.innerHTML = `<section class="panel detail-card">
        <div class="panel-heading"><div><p class="eyebrow">LICENSE DETAIL</p><h3>${escapeHtml(license.id)}</h3></div><button class="ghost-button small" id="license-close">Close</button></div>
        <div class="detail-grid">
          ${detailItem("Product", license.product_id)}${detailItem("User", license.user_id ?? "Unassigned")}${detailItem("Status", statusLabel(license.status))}${detailItem("Expires", formatDate(license.expires_at))}${detailItem("Created", formatDate(license.created_at))}${detailItem("Max devices", license.max_devices)}${detailItem("Redeems", license.redeem_count)}${detailItem("HWID resets", license.reset_count)}${detailItem("Last seen", formatDate(license.last_seen))}
        </div>
        <div class="safe-actions"><strong>Safe actions</strong><div>
          <button class="ghost-button small" data-action="active">Activate</button>
          <button class="ghost-button small danger" data-action="revoked">Revoke</button>
          <button class="ghost-button small danger" data-action="banned">Ban</button>
          <button class="ghost-button small" data-action="extend">Extend</button>
          <button class="ghost-button small" data-action="hwid">Reset HWID</button>
        </div></div>
        <div class="audit-mini"><p class="eyebrow">AUDIT</p>${renderAudit(audit)}</div>
      </section>`;
      detail.querySelector("#license-close").addEventListener("click", () => { detail.hidden = true; });
      detail.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => performAction(license, button.dataset.action)));
      detail.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      detail.innerHTML = `<section class="panel"><div class="empty"><strong>Unable to load detail</strong><p>${escapeHtml(error.message)}</p></div></section>`;
    }
  };

  const performAction = async (license, action) => {
    let endpoint = "";
    let method = "POST";
    let body = null;
    let question = "";
    if (["active", "revoked", "banned"].includes(action)) {
      endpoint = `/licenses/${encodeURIComponent(license.id)}/status`;
      method = "PATCH";
      body = { status: action };
      question = `Set this license to ${action.toUpperCase()}?`;
    } else if (action === "extend") {
      const days = window.prompt("Extension duration in days (1-3650):", "30");
      if (days === null) return;
      if (!/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 3650) { showMessage("Enter a duration from 1 to 3650 days.", true); return; }
      endpoint = `/licenses/${encodeURIComponent(license.id)}/extend`;
      body = { duration_days: Number(days) };
      question = `Extend this license by ${days} days?`;
    } else if (action === "hwid") {
      endpoint = `/licenses/${encodeURIComponent(license.id)}/hwid/reset`;
      question = "Reset the bound HWID for this license?";
    }
    if (!window.confirm(question)) return;
    try {
      const response = await fetch(`${API}${endpoint}`, { method, credentials: "include", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `Action failed (${response.status})`);
      showMessage("License action completed.");
      await load();
      await openDetail(license.id);
    } catch (error) {
      showMessage(`License action failed: ${error.message}`, true);
    }
  };

  search.addEventListener("input", () => { state.q = search.value.trim(); state.page = 1; load(); });
  status.addEventListener("change", () => { state.status = status.value; state.page = 1; load(); });
  container.querySelector("#license-refresh").addEventListener("click", load);
  load();
}

function detailItem(label, value) { return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`; }
function renderAudit(audit) {
  if (!audit.length) return `<div class="muted">No audit events available.</div>`;
  return `<ul>${audit.slice(0, 10).map((event) => `<li><span>${escapeHtml(event.previous_status ?? "—")} → ${escapeHtml(event.new_status ?? "—")}</span><small>${escapeHtml(formatDate(event.created_at))}</small></li>`).join("")}</ul>`;
}
