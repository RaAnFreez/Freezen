import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const TOKEN = "phase6-test-token";
const env = { FREZEN_ENV: "test", FREZEN_API_TOKEN: TOKEN };
const authHeaders = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

const db = (changes = 1) => ({
  prepare: (sql) => ({
    bind: (...values) => ({
      run: async () => {
        expect(sql).toContain("UPDATE licenses SET status");
        expect(values[0]).toMatch(/^(active|revoked)$/);
        return { meta: { changes } };
      },
    }),
  }),
});

describe("Frezen Phase 6A license lifecycle", () => {
  it("requires authentication", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses/demo/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "revoked" }),
    }), { ...env, DB: db() });
    expect(response.status).toBe(401);
  });

  it("revokes an existing license", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses/demo/status", {
      method: "PATCH", headers: authHeaders, body: JSON.stringify({ status: "revoked" }),
    }), { ...env, DB: db(1) });
    expect(response.status).toBe(200);
    expect((await response.json()).updated).toBe(true);
  });

  it("reactivates an existing license", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses/demo/status", {
      method: "PATCH", headers: authHeaders, body: JSON.stringify({ status: "active" }),
    }), { ...env, DB: db(1) });
    expect(response.status).toBe(200);
    expect((await response.json()).license.status).toBe("active");
  });

  it("rejects invalid status", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses/demo/status", {
      method: "PATCH", headers: authHeaders, body: JSON.stringify({ status: "expired" }),
    }), { ...env, DB: db() });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("INVALID_LICENSE_STATUS");
  });

  it("returns not found when no license was updated", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses/missing/status", {
      method: "PATCH", headers: authHeaders, body: JSON.stringify({ status: "revoked" }),
    }), { ...env, DB: db(0) });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("LICENSE_NOT_FOUND");
  });
});
