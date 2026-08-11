import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

describe("Frezen Worker", () => {
  it("returns a healthy status response", async () => {
    const response = await worker.fetch(
      new Request("https://frezen.test/api/v1/status"),
      { FREZEN_ENV: "test" },
    );

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
    const response = await worker.fetch(
      new Request("https://frezen.test/api/v1/health/db"),
      { FREZEN_ENV: "test" },
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("not_configured");
    expect(body.request_id).toEqual(expect.any(String));
  });

  it("looks up a user without exposing license hashes", async () => {
    const prepare = (sql) => ({
      bind: (...params) => {
        expect(sql).toContain("FROM users");
        expect(params).toEqual(["user-123"]);
        return {
          first: async () => ({
            id: 1,
            external_id: "user-123",
            display_name: "Test User",
            created_at: "2026-08-11T00:00:00.000Z",
            updated_at: "2026-08-11T00:00:00.000Z",
            license_key_hash: "must-not-leak",
          }),
        };
      },
    });

    const response = await worker.fetch(
      new Request("https://frezen.test/api/v1/users/user-123"),
      { FREZEN_ENV: "test", DB: { prepare } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user).toEqual({
      id: 1,
      external_id: "user-123",
      display_name: "Test User",
      created_at: "2026-08-11T00:00:00.000Z",
      updated_at: "2026-08-11T00:00:00.000Z",
    });
    expect(body.user.license_key_hash).toBeUndefined();
  });

  it("returns 404 when the requested user does not exist", async () => {
    const prepare = () => ({
      bind: () => ({ first: async () => null }),
    });

    const response = await worker.fetch(
      new Request("https://frezen.test/api/v1/users/missing-user"),
      { FREZEN_ENV: "test", DB: { prepare } },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("USER_NOT_FOUND");
  });

  it("rejects an invalidly long external id", async () => {
    const externalId = "x".repeat(129);
    const response = await worker.fetch(
      new Request(`https://frezen.test/api/v1/users/${externalId}`),
      { FREZEN_ENV: "test", DB: { prepare: () => { throw new Error("should not query"); } } },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("INVALID_EXTERNAL_ID");
  });

  it("does not expose protected content without authentication", async () => {
    const response = await worker.fetch(
      new Request("https://frezen.test/dashboard"),
      { FREZEN_ENV: "test" },
    );

    expect(response.status).toBe(404);
  });
});
