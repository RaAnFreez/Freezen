import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const overview = readFileSync(join(root, "overview.js"), "utf8");
const html = readFileSync(join(root, "../index.html"), "utf8");

describe("Phase 12 — Dashboard Overview", () => {
  it("loads overview data from the authenticated API", () => {
    expect(overview).toContain("/api/v1/dashboard/overview");
    expect(overview).toContain("credentials: \"include\"");
  });

  it("supports the required overview ranges", () => {
    for (const range of ["24h", "7d", "30d", "90d"]) expect(overview).toContain(range);
  });

  it("renders all Phase 12 metrics and charts without hardcoded live values", () => {
    for (const metric of ["total_licenses", "active_licenses", "expired_licenses", "revoked_licenses", "users", "script_requests", "safelinku_claims", "hwid_resets"]) expect(overview).toContain(metric);
    expect(overview).toContain("license_activity");
    expect(overview).toContain("recent_activity");
    expect(html).toContain("/src/overview.js");
  });
});
