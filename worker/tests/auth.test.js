import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const TOKEN = "phase4-test-token";
const env = { FREZEN_ENV: "test", FREZEN_API_TOKEN: TOKEN };

const request = (url, token = TOKEN) =>
  new Request(url, token === null ? undefined : {
    headers: { Authorization: `Bearer ${token}` },
  });

describe("Frezen Authentication Phase 5 compatibility", () => {
  it("keeps status public", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/status"), env);
    expect(response.status).toBe(200);
  });

  it("returns 401 when Authorization is missing", async () => {
    const response = await worker.fetch(
      request("https://frezen.test/api/v1/users/user-123", null),
      { ...env, DB: { prepare: () => { throw new Error("must not query"); } } },
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("UNAUTHENTICATED");
  });

  it("returns 403 when the bearer token is incorrect", async () => {
    const response = await worker.fetch(
      request("https://frezen.test/api/v1/users/user-123", "wrong-token"),
      { ...env, DB: { prepare: () => { throw new Error("must not query"); } } },
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("UNAUTHORIZED");
  });

  it("returns 401 when authentication credentials are missing", async () => {
    const response = await worker.fetch(
      request("https://frezen.test/api/v1/users/user-123", null),
      { FREZEN_ENV: "test", DB: { prepare: () => { throw new Error("must not query"); } } },
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("UNAUTHENTICATED");
  });

  it("allows an authenticated user lookup", async () => {
    const prepare = (sql) => ({
      bind: (...params) => {
        expect(sql).toContain("FROM users");
        expect(params).toEqual(["user-123"]);
        return { first: async () => ({ id: "user-123", email: "test@example.com", username: "test-user", role: "SUPPORT", status: "ACTIVE", created_at: "2026-08-11T00:00:00.000Z", updated_at: "2026-08-11T00:00:00.000Z" }) };
      },
    });
    const response = await worker.fetch(
      request("https://frezen.test/api/v1/users/user-123"),
      { ...env, DB: { prepare } },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.id).toBe("user-123");
    expect(body.user.username).toBe("test-user");
  });

  it("allows an authenticated license lookup", async () => {
    const prepare = (sql) => ({
      bind: (...params) => {
        expect(sql).toContain("FROM licenses");
        expect(sql).not.toContain("license_key_hash");
        expect(params).toEqual(["license-123"]);
        return { first: async () => ({ id: "license-123", user_id: 1, status: "active", expires_at: "2027-08-11T00:00:00.000Z", created_at: "2026-08-11T00:00:00.000Z", updated_at: "2026-08-11T00:00:00.000Z" }) };
      },
    });
    const response = await worker.fetch(
      request("https://frezen.test/api/v1/licenses/license-123"),
      { ...env, DB: { prepare } },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).license.id).toBe("license-123");
  });
});
