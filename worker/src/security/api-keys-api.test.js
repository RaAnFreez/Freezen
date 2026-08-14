import { describe, expect, it, vi } from "vitest";
import { createApiKey, listApiKeys, revokeApiKey, getApiKeyUsage } from "./api-keys-api.js";

function makeJson() {
  return (data, status = 200) => new Response(JSON.stringify(data), { status });
}

function makeDb() {
  const rows = [];
  const prepare = vi.fn((sql) => ({
    bind: (...args) => ({
      first: async () => {
        if (sql.includes("COUNT(*)")) return { count: rows.filter((row) => row.owner_user_id === args[0] && !row.revoked_at).length };
        if (sql.includes("SELECT id, revoked_at")) return rows.find((row) => row.id === args[0] && row.owner_user_id === args[1]) ?? null;
        if (sql.includes("SELECT id, key_prefix, name, last_used_at")) return rows.find((row) => row.id === args[0] && row.owner_user_id === args[1]) ?? null;
        return null;
      },
      all: async () => ({ results: rows.filter((row) => row.owner_user_id === args[0]) }),
      run: async () => {
        if (sql.startsWith("INSERT INTO api_keys")) {
          rows.push({ id: args[0], key_prefix: args[1], key_hash: args[2], name: args[3], owner_user_id: args[4], scopes_json: args[5], expires_at: args[6], revoked_at: null, last_used_at: null, created_at: "now", updated_at: "now" });
        }
        if (sql.startsWith("UPDATE api_keys")) {
          const row = rows.find((item) => item.id === args[0] && item.owner_user_id === args[1]);
          if (row) row.revoked_at = "now";
        }
        return {};
      },
    }),
  }));
  return { prepare, rows };
}

describe("API key lifecycle handlers", () => {
  it("creates a key and only returns the secret once", async () => {
    const DB = makeDb();
    const response = await createApiKey(new Request("https://example.test", { method: "POST", body: JSON.stringify({ name: "CI", scopes: ["licenses:read"] }) }), { DB }, "req-1", makeJson(), { user_id: "owner-1", role: "OWNER" });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.secret).toMatch(/^frz_[0-9a-f]{64}$/);
    expect(body.api_key.key_prefix).toBe(body.secret.slice(0, 12));
    expect(DB.rows).toHaveLength(1);
    expect(DB.rows[0].key_hash).not.toBe(body.secret);
  });

  it("lists only keys owned by the authenticated user", async () => {
    const DB = makeDb();
    DB.rows.push({ id: "a", name: "A", owner_user_id: "owner-1", key_prefix: "frz_a", scopes_json: "[\"licenses:read\"]", expires_at: null, revoked_at: null, last_used_at: null, created_at: "now", updated_at: "now" });
    DB.rows.push({ id: "b", name: "B", owner_user_id: "owner-2", key_prefix: "frz_b", scopes_json: "[]", expires_at: null, revoked_at: null, last_used_at: null, created_at: "now", updated_at: "now" });
    const response = await listApiKeys(new Request("https://example.test"), { DB }, "req-2", makeJson(), { user_id: "owner-1", role: "OWNER" });
    expect((await response.json()).api_keys.map((key) => key.id)).toEqual(["a"]);
  });

  it("revokes a key without exposing key material", async () => {
    const DB = makeDb();
    DB.rows.push({ id: "a", name: "A", owner_user_id: "owner-1", key_prefix: "frz_a", key_hash: "secret-hash", scopes_json: "[]", expires_at: null, revoked_at: null, last_used_at: null, created_at: "now", updated_at: "now" });
    const response = await revokeApiKey(new Request("https://example.test", { method: "POST" }), { DB }, "req-3", makeJson(), { user_id: "owner-1", role: "OWNER" }, "a");
    expect(response.status).toBe(200);
    expect(DB.rows[0].revoked_at).toBeTruthy();
    expect(JSON.stringify(await response.json())).not.toContain("secret-hash");
  });

  it("returns usage metadata without the key hash", async () => {
    const DB = makeDb();
    DB.rows.push({ id: "a", name: "A", owner_user_id: "owner-1", key_prefix: "frz_a", key_hash: "secret-hash", scopes_json: "[]", expires_at: null, revoked_at: null, last_used_at: "now", created_at: "now", updated_at: "now" });
    const response = await getApiKeyUsage(new Request("https://example.test"), { DB }, "req-4", makeJson(), { user_id: "owner-1", role: "OWNER" }, "a");
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("secret-hash");
  });
});
