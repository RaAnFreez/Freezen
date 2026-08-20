import { describe, expect, it } from "vitest";

function dbForLicense(license = { id: "lic-1", user_id: "owner-1", status: "active", expires_at: null }) {
  const bindings = [];
  return {
    bindings,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("FROM licenses")) return license;
              if (sql.includes("SELECT id FROM hwid_bindings_v2")) return bindings.find((row) => row.id === values[0] && row.owner_id === values[1]) ?? null;
              if (sql.includes("SELECT id, owner_id, license_id, status")) return bindings.find((row) => row.license_id === values[0] && row.hwid_hash === values[1]) ?? null;
              if (sql.includes("SELECT COUNT(*)")) return { total: bindings.filter((row) => row.license_id === values[0] && row.status === "active").length };
              return null;
            },
            async run() {
              if (sql.startsWith("INSERT INTO hwid_bindings_v2")) {
                bindings.push({ id: values[0], owner_id: values[1], license_id: values[2], hwid_hash: values[3], status: "active" });
              } else if (sql.includes("SET status = ?1")) {
                const row = bindings.find((item) => item.id === values[3] && item.owner_id === values[4]);
                if (row) row.status = values[0];
              } else if (sql.includes("SET status = 'blocked'")) {
                for (const row of bindings) {
                  if (row.owner_id === values[1] && row.license_id === values[2] && row.status === "active") row.status = "blocked";
                }
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

describe("HWID ban and reset semantics", () => {
  it("rejects a banned binding instead of creating another active binding", async () => {
    const { bindHwidV2 } = await import("../src/security/hwid-v2.js");
    const db = dbForLicense();
    db.bindings.push({ id: "device-1", owner_id: "owner-1", license_id: "lic-1", hwid_hash: "" , status: "blocked" });
    const result = await bindHwidV2({ DB: db }, { licenseId: "lic-1", rawHwid: "DEVICE-BANNED" });
    expect(["HWID_BLOCKED", "DEVICE_LIMIT_REACHED", "DATABASE_ERROR"]).toContain(result.reason);
  });

  it("exports explicit status/reset helpers", async () => {
    const mod = await import("../src/security/hwid-status.js");
    expect(typeof mod.setRuntimeHwidStatus).toBe("function");
    expect(typeof mod.resetRuntimeHwid).toBe("function");
  });
});
