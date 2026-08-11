import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const TOKEN = "phase4-test-token";
const authEnv = { FREZEN_ENV: "test", FREZEN_API_TOKEN: TOKEN };
const authRequest = (url) => new Request(url, { headers: { Authorization: `Bearer ${TOKEN}` } });

describe("Frezen Worker", () => {
  it("returns a healthy public status response", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/status"), { FREZEN_ENV: "test" });
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
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/health/db"), { FREZEN_ENV: "test" });
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe("not_configured");
  });

  it("looks up a user with authentication", async () => {
    const prepare = (sql) => ({
      bind: (...params) => {
        expect(sql).toContain("FROM users");
        expect(params).toEqual(["user-123"]);
        return { first: async () => ({ id: 1, external_id: "user-123", display_name: "Test User", created_at: "2026-08-11T00:00:00.000Z", updated_at: "2026-08-11T00:00:00.000Z", license_key_hash: "must-not-leak" }) };
      },
    });
    const response = await worker.fetch(authRequest("https://frezen.test/api/v1/users/user-123"), { ...authEnv, DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.external_id).toBe("user-123");
    expect(body.user.license_key_hash).toBeUndefined();
  });

  it("returns 404 when an authenticated user does not exist", async () => {
    const prepare = () => ({ bind: () => ({ first: async () => null }) });
    const response = await worker.fetch(authRequest("https://frezen.test/api/v1/users/missing-user"), { ...authEnv, DB: { prepare } });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("USER_NOT_FOUND");
  });

  it("rejects an invalidly long authenticated user id", async () => {
    const externalId = "x".repeat(129);
    const response = await worker.fetch(authRequest(`https://frezen.test/api/v1/users/${externalId}`), { ...authEnv, DB: { prepare: () => { throw new Error("should not query"); } } });
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
    const response = await worker.fetch(authRequest("https://frezen.test/api/v1/licenses/license-123"), { ...authEnv, DB: { prepare } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.license.id).toBe("license-123");
    expect(body.license.license_key_hash).toBeUndefined();
  });

  it("returns 404 when an authenticated license does not exist", async () => {
    const prepare = () => ({ bind: () => ({ first: async () => null }) });
    const response = await worker.fetch(authRequest("https://frezen.test/api/v1/licenses/missing-license"), { ...authEnv, DB: { prepare } });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("LICENSE_NOT_FOUND");
  });

  it("rejects an invalidly long authenticated license id", async () => {
    const licenseId = "x".repeat(129);
    const response = await worker.fetch(authRequest(`https://frezen.test/api/v1/licenses/${licenseId}`), { ...authEnv, DB: { prepare: () => { throw new Error("should not query"); } } });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("INVALID_LICENSE_ID");
  });
});
