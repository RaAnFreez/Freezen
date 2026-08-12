import { describe, expect, it } from "vitest";
import { authorizeScriptAccess } from "../src/security/script-authorization.js";

const auth = { user_id: "u1", role: "SUPPORT" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const request = (body) => new Request("https://frezen.test/api/v1/scripts/s1/authorize", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

function dbMock(overrides = {}) {
  const state = {
    user: { id: "u1", status: "ACTIVE" },
    script: { id: "s1", product_id: "p1", status: "ACTIVE", product_status: "ACTIVE" },
    license: { id: "l1", user_id: "u1", product_id: "p1", status: "ACTIVE", expires_at: null, max_devices: 1 },
    device: null,
    version: { id: "v1", version: "v1.0.0", status: "ACTIVE" },
    ...overrides,
  };
  const make = (sql, values) => ({
    first: async () => {
      if (sql.includes("FROM users")) return state.user;
      if (sql.includes("FROM scripts")) return state.script;
      if (sql.includes("FROM licenses")) return state.license;
      if (sql.includes("FROM devices")) return state.device;
      if (sql.includes("FROM script_versions")) return state.version;
      return null;
    },
    run: async () => ({ meta: { changes: 1 } }),
  });
  return {
    prepare(sql) { return { bind: (...values) => make(sql, values) }; },
    batch() { return Promise.resolve([]); },
  };
}

const env = {};
const base = { license_id: "l1", hwid: "android-device-1" };

describe("Phase 19 — Script ↔ License Authorization", () => {
  it("requires an authenticated session", async () => {
    const response = await authorizeScriptAccess(request(base), { DB: dbMock() }, "req-1", json, null, "s1");
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("SESSION_AUTH_REQUIRED");
  });

  it("denies inactive accounts server-side", async () => {
    const response = await authorizeScriptAccess(request(base), { DB: dbMock({ user: { id: "u1", status: "SUSPENDED" } }) }, "req-2", json, auth, "s1");
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("ACCOUNT_INACTIVE");
  });

  it("denies disabled scripts and products", async () => {
    let response = await authorizeScriptAccess(request(base), { DB: dbMock({ script: { id: "s1", product_id: "p1", status: "DISABLED", product_status: "ACTIVE" } }) }, "req-3", json, auth, "s1");
    expect((await response.json()).error).toBe("SCRIPT_DISABLED");

    response = await authorizeScriptAccess(request(base), { DB: dbMock({ script: { id: "s1", product_id: "p1", status: "ACTIVE", product_status: "DISABLED" } }) }, "req-4", json, auth, "s1");
    expect((await response.json()).error).toBe("PRODUCT_DISABLED");
  });

  for (const status of ["EXPIRED", "REVOKED", "BANNED", "UNUSED"]) {
    it(`denies license status ${status}`, async () => {
      const response = await authorizeScriptAccess(request(base), { DB: dbMock({ license: { id: "l1", user_id: "u1", product_id: "p1", status, expires_at: null, max_devices: 1 } }) }, `req-${status}`, json, auth, "s1");
      expect(response.status).toBe(403);
      expect((await response.json()).error).toMatch(/^LICENSE_/);
    });
  }

  it("denies an expired timestamp even when status says active", async () => {
    const response = await authorizeScriptAccess(request(base), { DB: dbMock({ license: { id: "l1", user_id: "u1", product_id: "p1", status: "ACTIVE", expires_at: "2000-01-01T00:00:00.000Z", max_devices: 1 } }) }, "req-expiry", json, auth, "s1");
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("LICENSE_EXPIRED");
  });

  it("denies a license owned by another account", async () => {
    const response = await authorizeScriptAccess(request(base), { DB: dbMock({ license: { id: "l1", user_id: "other", product_id: "p1", status: "ACTIVE", expires_at: null, max_devices: 1 } }) }, "req-owner", json, auth, "s1");
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("LICENSE_OWNERSHIP_REQUIRED");
  });

  it("denies product mismatch", async () => {
    const response = await authorizeScriptAccess(request(base), { DB: dbMock({ license: { id: "l1", user_id: "u1", product_id: "p2", status: "ACTIVE", expires_at: null, max_devices: 1 } }) }, "req-product", json, auth, "s1");
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("PRODUCT_LICENSE_MISMATCH");
  });

  it("denies HWID mismatch and blocked devices", async () => {
    let response = await authorizeScriptAccess(request(base), { DB: dbMock({ device: null }) }, "req-hwid", json, auth, "s1");
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("HWID_MISMATCH");

    response = await authorizeScriptAccess(request(base), { DB: dbMock({ device: { id: "d1", status: "BLOCKED" } }) }, "req-blocked", json, auth, "s1");
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("HWID_BLOCKED");
  });

  it("denies a non-active requested version", async () => {
    const response = await authorizeScriptAccess(request({ ...base, version_id: "v2" }), { DB: dbMock({ device: { id: "d1", status: "ACTIVE" }, version: { id: "v2", version: "v2.0.0", status: "ARCHIVED" } }) }, "req-version", json, auth, "s1");
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("SCRIPT_VERSION_NOT_ACTIVE");
  });

  it("authorizes only when every server-side condition matches", async () => {
    const response = await authorizeScriptAccess(request(base), { DB: dbMock({ device: { id: "d1", status: "ACTIVE" } }) }, "req-ok", json, auth, "s1");
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.authorized).toBe(true);
    expect(data.license.product_id).toBe("p1");
    expect(data.script.id).toBe("s1");
    expect(data.version.id).toBe("v1");
    expect(data.device.id).toBe("d1");
  });
});
