import { describe, expect, it } from "vitest";
import { issueDeliveryToken, deliverScript } from "../src/security/secure-delivery.js";

const SECRET = "test-secret-abcdefghijklmnopqrstuvwxyz-0123456789";
const json = (data, status = 200, requestId = "test-request") => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "x-request-id": requestId } });

function dbMock(row) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => sql.includes("SELECT u.status") ? row : null,
            run: async () => ({ meta: { changes: 1 } }),
          };
        },
      };
    },
  };
}

describe("Phase 20 Secure Delivery", () => {
  it("issues a signed token with a short expiry", async () => {
    const token = await issueDeliveryToken({ FREZEN_MASTER_SECRET: SECRET }, {
      user_id: "u1", license_id: "l1", script_id: "s1", version_id: "v1", device_id: "d1",
    });
    expect(token.split(".")).toHaveLength(2);
    expect(token.length).toBeLessThan(4096);
  });

  it("rejects missing bearer authorization", async () => {
    const response = await deliverScript(new Request("https://frezen.test/api/v1/scripts/s1/deliver", { method: "POST" }), { DB: dbMock(null), FREZEN_MASTER_SECRET: SECRET }, "r1", json);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("INVALID_DELIVERY_TOKEN");
  });

  it("delivers only when the signed context still matches active server state", async () => {
    const env = { DB: null, FREZEN_MASTER_SECRET: SECRET };
    const claims = { user_id: "u1", license_id: "l1", script_id: "s1", version_id: "v1", device_id: "d1" };
    const token = await issueDeliveryToken(env, claims);
    env.DB = dbMock({
      user_status: "ACTIVE",
      user_id: "u1",
      product_id: "p1",
      license_status: "ACTIVE",
      expires_at: null,
      script_id: "s1",
      script_status: "ACTIVE",
      script_product_id: "p1",
      product_status: "ACTIVE",
      device_id: "d1",
      device_status: "ACTIVE",
      version_id: "v1",
      version: "v1.0.0",
      version_status: "ACTIVE",
      file_name: "main.lua",
      content: "print('frezen')",
      content_type: "text/x-lua",
      size_bytes: 15,
      sha256: "abc",
    });
    const response = await deliverScript(new Request("https://frezen.test/api/v1/scripts/s1/deliver", { method: "POST", headers: { authorization: `Bearer ${token}` } }), env, "r2", json);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("print('frezen')");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("denies delivery after the license becomes inactive", async () => {
    const env = { FREZEN_MASTER_SECRET: SECRET, DB: dbMock({
      user_status: "ACTIVE", user_id: "u1", product_id: "p1", license_status: "REVOKED", expires_at: null,
      script_id: "s1", script_status: "ACTIVE", script_product_id: "p1", product_status: "ACTIVE", device_id: "d1", device_status: "ACTIVE", version_id: "v1", version: "v1.0.0", version_status: "ACTIVE", file_name: "main.lua", content: "blocked", content_type: "text/x-lua", size_bytes: 7, sha256: "abc",
    }) };
    const token = await issueDeliveryToken(env, { user_id: "u1", license_id: "l1", script_id: "s1", version_id: "v1", device_id: "d1" });
    const response = await deliverScript(new Request("https://frezen.test/api/v1/scripts/s1/deliver", { method: "POST", headers: { authorization: `Bearer ${token}` } }), env, "r3", json);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("LICENSE_NOT_ACTIVE");
  });
});
