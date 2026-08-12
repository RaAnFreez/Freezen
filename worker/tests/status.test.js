import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const TOKEN = "phase4-test-token";
const authHeaders = { Authorization: `Bearer ${TOKEN}` };
const env = (extra = {}) => ({ FREZEN_ENV: "test", FREZEN_API_TOKEN: TOKEN, ...extra });

describe("Frezen Worker", () => {
  it("returns a healthy public status response", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/status"), env());
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await response.json();
    expect(body.name).toBe("Frezen Control System V3");
    expect(body.status).toBe("ok");
    expect(body.environment).toBe("test");
    expect(body.database).toBe("not_configured");
    expect(body.request_id).toEqual(expect.any(String));
  });

  it("reports D1 as not configured when the binding is absent", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/health/db"), env());
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe("not_configured");
  });

  it("rejects authentication when the bearer token is missing", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/auth/verify"), env());
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("UNAUTHENTICATED");
  });

  it("rejects authentication when the bearer token is incorrect", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/auth/verify", { headers: { Authorization: "Bearer wrong-token" } }), env());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("UNAUTHORIZED");
  });

  it("accepts the configured bearer token", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/auth/verify", { headers: authHeaders }), env());
    expect(response.status).toBe(200);
    expect((await response.json()).authenticated).toBe(true);
  });

  it("returns an auth configuration error when the token is missing", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/auth/verify"), { FREZEN_ENV: "test" });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("AUTH_NOT_CONFIGURED");
  });

  it("protects user lookup with authentication", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/users/user-123"), env({ DB: { prepare: () => { throw new Error("should not query"); } } }));
    expect(response.status).toBe(401);
  });

  it("looks up a user with authentication without exposing license hashes", async () => {
    const prepare = (sql) => ({
      bind: (...params) => {
        expect(sql).toContain("FROM users");
        expect(params).toEqual(["user-123"]);
        return { first: async () => ({ id: 1, external_id: "user-123", display_name: "Test User", created_at: "2026-08-11T00:00:00.000Z", updated_at: "2026-08-11T00:00:00.000Z", license_key_hash: "must-not-leak" }) };
      },
    });
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/users/user-123", { headers: authHeaders }), env({ DB: { prepare } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.license_key_hash).toBeUndefined();
  });

  it("returns 404 when an authenticated user does not exist", async () => {
    const prepare = () => ({ bind: () => ({ first: async () => null }) });
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/users/missing-user", { headers: authHeaders }), env({ DB: { prepare } }));
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("USER_NOT_FOUND");
  });

  it("rejects an invalidly long authenticated user id", async () => {
    const externalId = "x".repeat(129);
    const response = await worker.fetch(new Request(`https://frezen.test/api/v1/users/${externalId}`, { headers: authHeaders }), env({ DB: { prepare: () => { throw new Error("should not query"); } } }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("INVALID_EXTERNAL_ID");
  });

  it("looks up a license with authentication without exposing its hash", async () => {
    const prepare = (sql) => ({
      bind: (...params) => {
        expect(sql).toContain("FROM licenses");
        expect(sql).not.toContain("license_key_hash");
        expect(params).toEqual(["license-123"]);
        return { first: async () => ({ id: "license-123", user_id: 1, status: "active", expires_at: "2027-08-11T00:00:00.000Z", created_at: "2026-08-11T00:00:00.000Z", updated_at: "2026-08-11T00:00:00.000Z", license_key_hash: "must-not-leak" }) };
      },
    });
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses/license-123", { headers: authHeaders }), env({ DB: { prepare } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.license.license_key_hash).toBeUndefined();
  });

  it("returns 404 when an authenticated license does not exist", async () => {
    const prepare = () => ({ bind: () => ({ first: async () => null }) });
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses/missing-license", { headers: authHeaders }), env({ DB: { prepare } }));
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("LICENSE_NOT_FOUND");
  });

  it("rejects an invalidly long authenticated license id", async () => {
    const licenseId = "x".repeat(129);
    const response = await worker.fetch(new Request(`https://frezen.test/api/v1/licenses/${licenseId}`, { headers: authHeaders }), env({ DB: { prepare: () => { throw new Error("should not query"); } } }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("INVALID_LICENSE_ID");
  });
});
