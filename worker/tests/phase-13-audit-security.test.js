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

  it("connects both production dashboard panels", () => {
    const html = read("public/dashboard/index.html");
    const main = read("public/dashboard/main.js");
    expect(html).toContain("audit-panel.js?v=phase13");
    expect(html).toContain("security-panel.js?v=phase13");
    expect(main).toContain("FrezenDashboardPanels?.audit");
    expect(main).toContain("FrezenDashboardPanels?.security");
  });

  it("records failed and successful login security events", () => {
    const auth = read("src/security/auth-api.js");
    expect(auth).toContain("LOGIN_FAILED");
    expect(auth).toContain("LOGIN_SUCCESS");
    expect(auth).toContain("LOGIN_RATE_LIMITED");
  });
});
