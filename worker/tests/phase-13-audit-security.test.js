import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("Phase 13 audit and security surfaces", () => {
  it("keeps the existing security event schema compatible", () => {
    const migration = read("migrations/0008_phase13_audit_security.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS security_events");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_security_events_created_at");
    const module = read("src/security/security-events.js");
    expect(module).toContain("(id, user_id, event_type, severity, request_id, metadata_json)");
  });

  it("keeps the dashboard scoped to the four requested core controls", () => {
    const html = read("public/dashboard/index.html");
    const main = read("public/dashboard/main.js");
    const keyPanel = read("public/dashboard/license-panel.js");

    expect(html).toContain("license-panel.js?v=core-controls");
    expect(html).toContain("hwid-panel.js?v=core-controls");
    expect(html).toContain("scripts-panel.js?v=core-controls");
    expect(html).toContain("safelinku-panel.js?v=core-controls");

    expect(main).toContain("['licenses','Key Control'");
    expect(main).toContain("['hwid','HWID Control'");
    expect(main).toContain("['scripts','Script Control'");
    expect(main).toContain("['safelinku','SafeLinkU'");
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
