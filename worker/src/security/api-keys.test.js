import test from "node:test";
import assert from "node:assert/strict";
import { createApiKeySecret, hashApiKey, apiKeyPrefix, normalizeApiKeyScopes, isApiKeyUsable } from "./api-keys.js";

test("API key secrets are random and prefixed", () => {
  const first = createApiKeySecret();
  const second = createApiKeySecret();
  assert.match(first, /^frz_[0-9a-f]{64}$/);
  assert.match(second, /^frz_[0-9a-f]{64}$/);
  assert.notEqual(first, second);
  assert.equal(apiKeyPrefix(first), first.slice(0, 12));
});

test("API key hashes are deterministic", async () => {
  const secret = createApiKeySecret();
  assert.equal(await hashApiKey(secret), await hashApiKey(secret));
  assert.notEqual(await hashApiKey(secret), await hashApiKey(createApiKeySecret()));
});

test("API key scopes are normalized and bounded", () => {
  assert.deepEqual(normalizeApiKeyScopes(["licenses:read", "licenses:read", "bad scope", "hwid:read"]), ["licenses:read", "hwid:read"]);
});

test("revoked and expired API keys are unusable", () => {
  assert.equal(isApiKeyUsable({ revoked_at: null, expires_at: null }), true);
  assert.equal(isApiKeyUsable({ revoked_at: "2026-01-01T00:00:00Z", expires_at: null }), false);
  assert.equal(isApiKeyUsable({ revoked_at: null, expires_at: "2020-01-01T00:00:00Z" }), false);
});
