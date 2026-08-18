import { describe, expect, it } from "vitest";
import { generateLicense, redeemLicense, extendLicense, resetLicenseHwid } from "../src/security/license-lifecycle.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const request = (body) => new Request("https://frezen.test/api/v1/licenses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function makeDb({ product = { id: "prod-1", status: "ACTIVE" }, license = null, updateChanges = 1 } = {}) {
  const statements = [];
  const columns = ["id", "license_key_hash", "product_id", "user_id", "status", "expires_at", "max_devices", "current_hwid", "reset_count", "last_seen"];
  return {
    statements,
    prepare(sql) {
      statements.push(sql);
      return {
        async all() {
          if (sql.includes("PRAGMA table_info(licenses)")) return { results: columns.map((name, cid) => ({ cid, name })) };
          return { results: [] };
        },
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM products")) return product;
              if (sql.includes("FROM licenses")) return license;
              return null;
            },
            async run() {
              return { meta: { changes: updateChanges }, args };
            },
          };
        },
      };
    },
  };
}

describe("Phase 14 license system", () => {
  it("generates a secure active license and never stores plaintext", async () => {
    const db = makeDb();
    const response = await generateLicense(request({ product_id: "prod-1", duration_days: 30, max_devices: 2 }), { DB: db }, "req-1", json, { user_id: "owner-1" });
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.created).toBe(true);
    expect(body.license.status).toBe("active");
    expect(body.license_key).toMatch(/^FREZEN-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);
    expect(db.statements.some((sql) => sql.includes("license_key_hash") && sql.includes("INSERT"))).toBe(true);
    expect(db.statements.some((sql) => sql.includes("license_key") && !sql.includes("license_key_hash"))).toBe(false);
  });

  it("rejects generation for a disabled product", async () => {
    const db = makeDb({ product: { id: "prod-1", status: "DISABLED" } });
    const response = await generateLicense(request({ product_id: "prod-1" }), { DB: db }, "req-2", json, { user_id: "owner-1" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("PRODUCT_DISABLED");
  });

  it("redeems an unused license for the authenticated user", async () => {
    const db = makeDb({ license: { id: "lic-1", user_id: null, product_id: "prod-1", status: "unused", expires_at: null, redeem_count: 0 } });
    const response = await redeemLicense(request({ license_key: "FREZEN-DEMO" }), { DB: db }, "req-3", json, { user_id: "user-1" });
    expect(response.status).toBe(200);
    expect((await response.json()).redeemed).toBe(true);
    expect(db.statements.some((sql) => sql.includes("UPDATE licenses SET user_id") && sql.includes("status = 'active'"))).toBe(true);
  });

  it("redeems a production-schema active license when it has no owner yet", async () => {
    const db = makeDb({ license: { id: "lic-legacy", user_id: null, product_id: "prod-1", status: "active", expires_at: null } });
    const response = await redeemLicense(request({ license_key: "FREZEN-LEGACY" }), { DB: db }, "req-legacy-active", json, { user_id: "user-1" });
    expect(response.status).toBe(200);
    expect((await response.json()).redeemed).toBe(true);
  });

  it("rejects redemption of an already redeemed license", async () => {
    const db = makeDb({ license: { id: "lic-1", user_id: "another-user", product_id: "prod-1", status: "active", expires_at: null, redeem_count: 1 } });
    const response = await redeemLicense(request({ license_key: "FREZEN-DEMO" }), { DB: db }, "req-4", json, { user_id: "user-1" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("LICENSE_UNAVAILABLE");
  });

  it("extends an expired license from the current time and reactivates it", async () => {
    const db = makeDb({ license: { id: "lic-1", status: "expired", expires_at: "2020-01-01T00:00:00.000Z" } });
    const response = await extendLicense(request({ duration_days: 30 }), { DB: db }, "req-5", json, "lic-1");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.extended).toBe(true);
    expect(body.license.status).toBe("active");
    expect(new Date(body.license.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("resets the current HWID and increments the reset counter", async () => {
    const db = makeDb({ license: { id: "lic-1", status: "active", reset_count: 2 } });
    const response = await resetLicenseHwid(new Request("https://frezen.test", { method: "POST" }), { DB: db }, "req-6", json, "lic-1");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reset).toBe(true);
    expect(body.license.status).toBe("active");
    expect(db.statements.some((sql) => sql.includes("current_hwid = NULL") && sql.includes("reset_count = reset_count + 1"))).toBe(true);
  });
});
