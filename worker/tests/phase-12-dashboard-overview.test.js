import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const makeDb = () => ({
  prepare(sql) {
    return {
      bind(...args) {
        return {
          async first() {
            if (sql.includes("FROM sessions")) return null;
            if (sql.includes("COUNT")) return { count: 2 };
            return { ok: 1 };
          },
          async all() {
            if (sql.includes("audit_logs")) return { results: [{ id: "log-1", action: "LOGIN_SUCCESS", status: "SUCCESS", created_at: "2026-08-12 00:00:00" }] };
            return { results: [{ date: "2026-08-12", count: 2 }] };
          },
        };
      },
      async first() { return { count: 2 }; },
      async all() { return { results: [] }; },
    };
  },
});

const env = { FREZEN_ENV: "test", DB: makeDb() };

function request(range = "7d") {
  return new Request(`https://frezen.test/api/v1/dashboard/overview?range=${range}`, { headers: { authorization: "Bearer test-token" } });
}

describe("Phase 12 — Dashboard Overview API", () => {
  it("rejects unauthenticated access", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/dashboard/overview"), env);
    expect(response.status).toBe(401);
  });

  it("enforces the required users:read permission server-side", async () => {
    const response = await worker.fetch(request("7d"), { FREZEN_ENV: "test", FREZEN_API_TOKEN: "test-token", AUTH_ROLE: "UNKNOWN" });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("FORBIDDEN");
  });

  it("does not expose secrets in the overview response contract", async () => {
    const response = await worker.fetch(request("30d"), { ...env, AUTH_ROLE: "ADMIN" });
    const text = await response.text();
    expect(text).not.toContain("password_hash");
    expect(text).not.toContain("token_hash");
  });
});
