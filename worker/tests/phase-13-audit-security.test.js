import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const hasDashboardAsset = (html, asset) => new RegExp(`/dashboard/${asset}\\?v=provider-getkey-v\\d+`).test(html);

describe("Phase 13 audit and security surfaces", () => {
  it("keeps the existing security event schema compatible", () => {
    const migration = read("migrations/0008_phase13_audit_security.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS security_events");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_security_events_created_at");
    const module = read("src/security/security-events.js");
    expect(module).toContain("(id, user_id, event_type, severity, request_id, metadata_json)");
  });

  it("keeps the dashboard core controls and categorized navigation compatible", () => {
    const html = read("public/dashboard/index.html");
    const main = read("public/dashboard/main.js");
    const keyPanel = read("public/dashboard/license-panel.js");

    expect(hasDashboardAsset(html, "license-panel.js")).toBe(true);
    expect(hasDashboardAsset(html, "hwid-panel.js")).toBe(true);
    expect(hasDashboardAsset(html, "scripts-panel.js")).toBe(true);
    expect(hasDashboardAsset(html, "safelinku-panel.js")).toBe(true);
    expect(hasDashboardAsset(html, "provider-panel.js")).toBe(true);
    expect(hasDashboardAsset(html, "service-panel.js")).toBe(true);

    expect(main).toContain("['licenses','Keys'");
    expect(main).toContain("['hwid','HWIDs'");
    expect(main).toContain("['scripts','Lua Scripts'");
    expect(main).toContain("['safelinku','SafeLinkU'");
    expect(main).toContain("['services','Services'");
    expect(main).toContain("['provider','Provider'");
    expect(main).toContain("label: 'KEY SYSTEM'");
    expect(main).toContain("label: 'SCRIPTS'");
    expect(main).toContain("label: 'MODERATION'");
    expect(main).toContain("licenses: 'licenses'");
    expect(keyPanel).toContain("KEY CONTROL");
    expect(keyPanel).toContain("window.FrezenDashboardPanels.licenses = mount");
    expect(keyPanel).not.toContain("document.addEventListener('click'");

    expect(html).not.toContain("audit-panel.js");
    expect(html).not.toContain("security-panel.js");
    expect(main).not.toContain("FrezenDashboardPanels?.audit");
    expect(main).not.toContain("FrezenDashboardPanels?.security");
    expect(main).not.toContain("document.addEventListener('click'");
  });

  it("records failed and successful login security events", () => {
    const auth = read("src/security/auth-api.js");
    expect(auth).toContain("LOGIN_FAILED");
    expect(auth).toContain("LOGIN_SUCCESS");
    expect(auth).toContain("LOGIN_RATE_LIMITED");
  });
});
