import { describe, expect, it } from "vitest";
import { resetHwidV2 } from "../src/security/hwid-v2.js";

function makeDb() {
  const bindings = [{ id: "device-1", owner_id: "owner-session", license_id: "lic-1", status: "active" }];
  const license = { id: "lic-1", user_id: null, key_owner_id: "owner-key", status: "active", expires_at: null };

  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() {
          if (sql.includes("FROM licenses l")) return license;
          if (sql.includes("WHERE license_id = ?1 AND owner_id = ?2")) return bindings.find((row) => row.license_id === values[0] && row.owner_id === values[1]) ?? null;
          return null;
        },
        async run() {
          if (sql.includes("DELETE FROM hwid_bindings_v2")) {
            bindings.splice(0, bindings.length, ...bindings.filter((row) => !(row.owner_id === values[0] && row.license_id === values[1] && row.status === "active")));
          }
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

describe("HWID reset owner fallback", () => {
  it("allows reset when the current owner matches an existing visible binding", async () => {
    const result = await resetHwidV2({ DB: makeDb() }, { ownerId: "owner-session", licenseId: "lic-1" });
    expect(result.ok).toBe(true);
  });
});
