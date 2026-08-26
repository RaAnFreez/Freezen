import "./styles.css";
import "./theme.css";
import { renderProducts } from "./products.js";
import { renderLicenses } from "./licenses.js";
import { renderHwid } from "./hwid.js";
import { renderScripts } from "./scripts.js";
import { renderKeys } from "./keys.js";

const items = [
  ["overview", "Overview"], ["licenses", "Licenses"], ["keys", "Keys"], ["products", "Products"], ["scripts", "Scripts"], ["script-delivery", "Script Delivery"], ["users", "Users"], ["hwid", "HWID"], ["safelinku", "SafeLinkU"], ["discord", "Discord"], ["analytics", "Analytics"], ["audit", "Audit Logs"], ["invites", "Invites"], ["security", "Security"], ["settings", "Settings"],
];

const app = document.querySelector("#app");
app.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="brand"><span class="brand-mark">F</span><span>FREZEN</span></div>
      <nav>${items.map(([id, label], index) => `<button class="nav-item ${index === 0 ? "active" : ""}" data-section="${id}"><span>${icon(id)}</span><span>${label}</span></button>`).join("")}</nav>
      <div class="sidebar-footer"><span class="status-dot"></span> System protected</div>
    </aside>
    <div class="mobile-overlay" id="overlay"></div>
    <main class="main">
      <header class="topbar"><button class="menu-button" id="menu" aria-label="Open navigation">MENU</button><div><p class="eyebrow">CONTROL SYSTEM V3</p><h1 id="page-title">Overview</h1></div><div class="top-actions"><button class="icon-button" aria-label="Notifications">N</button><div class="avatar">O</div></div></header>
      <section class="content" id="content"></section>
    </main>
  </div>`;

const content = document.querySelector("#content");
const title = document.querySelector("#page-title");
const sidebar = document.querySelector("#sidebar");
const overlay = document.querySelector("#overlay");
document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active")); button.classList.add("active"); title.textContent = button.textContent.trim(); renderSection(button.dataset.section); sidebar.classList.remove("open"); overlay.classList.remove("show"); }));
document.querySelector("#menu").addEventListener("click", () => { sidebar.classList.add("open"); overlay.classList.add("show"); });
overlay.addEventListener("click", () => { sidebar.classList.remove("open"); overlay.classList.remove("show"); });

function renderSection(section) {
  if (section === "products") return renderProducts(content);
  if (section === "licenses") return renderLicenses(content);
  if (section === "keys") return renderKeys(content);
  if (section === "hwid") return renderHwid(content);
  if (section === "scripts" || section === "script-delivery") return renderScripts(content);
  const isOverview = section === "overview";
  content.innerHTML = isOverview ? `
    <div class="welcome"><div><p class="eyebrow">PRIVATE ADMIN AREA</p><h2>Welcome back, Owner</h2><p>Manage Frezen services from one secure control center.</p></div><span class="protected-badge"><i></i> Protected</span></div>
    <div class="stats-grid">${stat("Total Licenses", "—", "Awaiting API data", "key")}${stat("Active Licenses", "—", "Awaiting API data", "check")}${stat("Expired Licenses", "—", "Awaiting API data", "expired")}${stat("Revoked Licenses", "—", "Awaiting API data", "revoked")}${stat("Users", "—", "Awaiting API data", "users")}${stat("Script Requests", "—", "Awaiting API data", "script")}${stat("SafeLinkU Claims", "—", "Awaiting API data", "safelinku")}${stat("HWID Resets", "—", "Awaiting API data", "hwid")}</div>
    <div class="panel-grid"><section class="panel"><div class="panel-heading"><div><p class="eyebrow">ACTIVITY</p><h3>Recent activity</h3></div><button class="ghost-button">View logs</button></div><div class="empty"><span>--</span><strong>No activity loaded</strong><p>Connect the dashboard to the authenticated Frezen API to display live activity.</p></div></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">SYSTEM</p><h3>Service status</h3></div></div><div class="service"><span><i></i> Authentication</span><b>Protected</b></div><div class="service"><span><i></i> Authorization</span><b>Protected</b></div><div class="service"><span><i></i> Database</span><b>Protected</b></div></section></div>` : `<section class="panel section-placeholder"><p class="eyebrow">${section.toUpperCase()}</p><h2>${items.find(([id]) => id === section)?.[1] ?? section}</h2><p>This navigation surface is ready. Feature-specific data and actions will be implemented only in their corresponding roadmap phases.</p></section>`;
}
function stat(label, value, note, type) { return `<article class="stat-card"><div class="stat-icon">${icon(type)}</div><p>${label}</p><strong>${value}</strong><small>${note}</small></article>`; }
function icon(id) { const map = { overview: "OV", licenses: "LC", keys: "KY", products: "PR", scripts: "SC", "script-delivery": "LD", users: "US", hwid: "HW", safelinku: "SL", discord: "DS", analytics: "AN", audit: "AL", invites: "IN", security: "SE", settings: "ST", key: "KY", check: "OK", expired: "EX", revoked: "RV", script: "SC" }; return map[id] ?? "--"; }
renderSection("overview");
