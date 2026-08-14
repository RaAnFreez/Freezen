import { describe, expect, it } from "vitest";
import { createApiKeySecret, hashApiKey, apiKeyPrefix, normalizeApiKeyScopes, isApiKeyUsable } from "./api-keys.js";

describe("API key helpers", () => {
  it("creates random prefixed secrets", () => {
    const first = createApiKeySecret();
    const second = createApiKeySecret();
    expect(first).toMatch(/^frz_[0-9a-f]{64}$/);
    expect(second).toMatch(/^frz_[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
    expect(apiKeyPrefix(first)).toBe(first.slice(0, 12));
  });

  it("creates deterministic hashes", async () => {
    const secret = createApiKeySecret();
    expect(await hashApiKey(secret)).toBe(await hashApiKey(secret));
    expect(await hashApiKey(secret)).not.toBe(await hashApiKey(createApiKeySecret()));
  });

  it("normalizes and bounds scopes", () => {
    expect(normalizeApiKeyScopes(["licenses:read", "licenses:read", "bad scope", "hwid:read"]))
      .toEqual(["licenses:read", "hwid:read"]);
  });

  it("rejects revoked and expired keys", () => {
    expect(isApiKeyUsable({ revoked_at: null, expires_at: null })).toBe(true);
    expect(isApiKeyUsable({ revoked_at: "2026-01-01T00:00:00Z", expires_at: null })).toBe(false);
    expect(isApiKeyUsable({ revoked_at: null, expires_at: "2020-01-01T00:00:00Z" })).toBe(false);
  });
});
