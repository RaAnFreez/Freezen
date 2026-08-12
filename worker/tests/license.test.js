import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const TOKEN = "phase5-test-token";
const env = { FREZEN_ENV: "test", FREZEN_API_TOKEN: TOKEN };
const authHeaders = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

const db = (row) => ({
  prepare: (sql) => ({
    bind: (hash) => ({
      first: async () => {
        expect(sql).toContain("license_key_hash");
        expect(hash).toHaveLength(64);
        return row;
      },
    }),
  }),
});

describe("Frezen Authentication Phase 5 license validation", () => {
  it("requires authentication", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ license_key: "demo" }),
    }), { ...env, DB: db(null) });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("UNAUTHENTICATED");
  });

  it("validates an active license", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses/validate", {
      method: "POST", headers: authHeaders, body: JSON.stringify({ license_key: "demo" }),
    }), { ...env, DB: db({ id: "lic-1", user_id: "user-1", status: "active", expires_at: "2099-01-01T00:00:00.000Z" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).valid).toBe(true);
  });

  it("rejects a revoked license", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses/validate", {
      method: "POST", headers: authHeaders, body: JSON.stringify({ license_key: "demo" }),
    }), { ...env, DB: db({ id: "lic-1", user_id: "user-1", status: "revoked", expires_at: null }) });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("LICENSE_REVOKED");
  });

  it("rejects an expired license", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses/validate", {
      method: "POST", headers: authHeaders, body: JSON.stringify({ license_key: "demo" }),
    }), { ...env, DB: db({ id: "lic-1", user_id: "user-1", status: "active", expires_at: "2020-01-01T00:00:00.000Z" }) });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("LICENSE_EXPIRED");
  });

  it("returns not found for an unknown license", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses/validate", {
      method: "POST", headers: authHeaders, body: JSON.stringify({ license_key: "demo" }),
    }), { ...env, DB: db(null) });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("LICENSE_NOT_FOUND");
  });
});
