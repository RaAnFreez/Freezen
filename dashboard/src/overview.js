const RANGE_LABELS = { "24h": "24H", "7d": "7D", "30d": "30D", "90d": "90D" };

async function loadOverview(range = "7d") {
  const root = document.querySelector("#content");
  if (!root || !root.querySelector(".stats-grid")) return;
  try {
    const response = await fetch(`/api/v1/dashboard/overview?range=${encodeURIComponent(range)}`, { credentials: "include", headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const metrics = data.metrics ?? {};
    const cards = [["Total Licenses", metrics.total_licenses], ["Active Licenses", metrics.active_licenses], ["Users", metrics.users], ["Script Requests", metrics.script_requests]];
    root.querySelectorAll(".stat-card").forEach((card, index) => { const value = card.querySelector("strong"); const note = card.querySelector("small"); if (cards[index]) { value.textContent = String(cards[index][1] ?? 0); note.textContent = `Live · ${RANGE_LABELS[data.range] ?? "7D"}`; } });
    const empty = root.querySelector(".empty");
    if (empty) empty.innerHTML = renderActivity(data.recent_activity ?? []);
    const activityPanel = root.querySelector(".panel-grid .panel");
    if (activityPanel && !activityPanel.querySelector(".range-tabs")) {
      const heading = activityPanel.querySelector(".panel-heading");
      const tabs = document.createElement("div"); tabs.className = "range-tabs";
      tabs.innerHTML = Object.entries(RANGE_LABELS).map(([key, label]) => `<button class="range-tab ${key === data.range ? "active" : ""}" data-range="${key}">${label}</button>`).join("");
      heading.appendChild(tabs);
      tabs.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => loadOverview(button.dataset.range)));
    } else if (activityPanel) activityPanel.querySelectorAll(".range-tab").forEach((button) => button.classList.toggle("active", button.dataset.range === data.range));
    renderChart(root, data.charts?.license_activity ?? [], data.charts?.script_requests ?? []);
  } catch { root.querySelectorAll(".stat-card small").forEach((node) => { node.textContent = "Unable to load live data"; }); }
}

function renderActivity(rows) {
  if (!rows.length) return `<span>◌</span><strong>No recent activity</strong><p>No audit activity has been recorded yet.</p>`;
  return `<div class="activity-list">${rows.map((row) => `<div class="activity-row"><span class="activity-status">${escapeHtml(row.status ?? "UNKNOWN")}</span><div><strong>${escapeHtml(row.action ?? "Unknown action")}</strong><small>${escapeHtml(row.resource_type ?? "resource")} · ${escapeHtml(row.created_at ?? "")}</small></div></div>`).join("")}</div>`;
}

function renderChart(root, licenseRows, scriptRows) {
  let chart = root.querySelector(".overview-chart");
  if (!chart) {
    chart = document.createElement("section"); chart.className = "panel overview-chart";
    chart.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">ACTIVITY</p><h3>Activity trend</h3></div></div><div class="chart" aria-label="License and script request activity"></div>`;
    root.querySelector(".panel-grid")?.before(chart);
  }
  const map = new Map();
  for (const row of licenseRows) map.set(row.date, { license: row.count, script: 0 });
  for (const row of scriptRows) map.set(row.date, { ...(map.get(row.date) ?? { license: 0 }), script: row.count });
  const points = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  chart.querySelector(".chart").innerHTML = points.length ? points.map(([date, value]) => `<div class="chart-row"><span>${escapeHtml(date)}</span><div class="bars"><i style="width:${barWidth(value.license, points)}%" title="Licenses: ${value.license}"></i><b style="width:${barWidth(value.script, points)}%" title="Script requests: ${value.script}"></b></div><small>${value.license} / ${value.script}</small></div>`).join("") : `<div class="empty"><strong>No activity in selected range</strong><p>New license and script request activity will appear here.</p></div>`;
}

function barWidth(value, points) { const max = Math.max(1, ...points.map(([, row]) => Math.max(row.license, row.script))); return Math.max(value ? 4 : 0, Math.round((value / max) * 100)); }
function escapeHtml(value) { return String(value).replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }

const observer = new MutationObserver(() => {
  const root = document.querySelector("#content");
  if (root?.querySelector(".stats-grid") && !root.querySelector(".range-tabs") && !root.querySelector(".overview-chart")) loadOverview();
});
observer.observe(document.querySelector("#content") ?? document.body, { childList: true, subtree: true });
window.addEventListener("load", () => loadOverview());
