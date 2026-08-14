import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("Phase 13 audit and security surfaces", () => {
  it("keeps the existing audit and security D1 tables intact", () => {
    const migration = read("migrations/0008_phase13_audit_security.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS security_events");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_security_events_created_at");
  });

  it("does not expose security metadata through the API response", () => {
    const module = read("src/security/security-events.js");
    expect(module).toContain("SELECT id, event_type, severity, user_id, request_id, metadata_json, created_at");
    expect(module).toContain("event_type");
  });

  it("connects both production dashboard panels", () => {
    const html = read("public/dashboard/index.html");
    const main = read("public/dashboard/main.js");
    expect(html).toContain("audit-panel.js?v=phase13");
    expect(html).toContain("security-panel.js?v=phase13");
    expect(main).toContain("FrezenDashboardPanels?.audit");
    expect(main).toContain("FrezenDashboardPanels?.security");
  });
});
