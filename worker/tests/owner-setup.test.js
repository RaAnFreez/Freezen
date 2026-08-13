import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { setupOwner } from "../src/security/owner-setup.js";

const json = (data, status) => new Response(JSON.stringify(data), { status });

const createDb = (rows = {}, legacy = false) => {
  const calls = [];
  const columns = legacy
    ? ["id", "external_id", "display_name", "created_at", "updated_at"]
    : ["id", "email", "username", "password_hash", "role", "status", "last_login_at"];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              calls.push({ sql, params, op: "first" });
              if (sql.includes("role = ?1")) return rows.owner ?? null;
              if (sql.includes("email = ?1")) return rows.email ?? null;
              return null;
            },
            async all() {
              calls.push({ sql, params, op: "all" });
              if (sql.includes("PRAGMA table_info(users)")) return { results: columns.map((name) => ({ name })) };
              return { results: [] };
            },
            async run() {
              calls.push({ sql, params, op: "run" });
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
        async all() {
          calls.push({ sql, params: [], op: "all" });
          if (sql.includes("PRAGMA table_info(users)")) return { results: columns.map((name) => ({ name })) };
          return { results: [] };
        },
        async run() {
          calls.push({ sql, params: [], op: "run" });
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };
};

const env = (DB, extra = {}) => ({
  DB,
  FREZEN_MASTER_SECRET: "x".repeat(32),
  OWNER_EMAIL: "owner@example.com",
  ...extra,
});

const request = (body) => new Request("https://frezen.test/api/v1/setup/owner", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-frezen-setup-secret": "x".repeat(32),
  },
  body: JSON.stringify(body),
});

describe("Phase 7 owner setup", () => {
  it("creates exactly one OWNER with a password hash", async () => {
    const db = createDb();
    const response = await setupOwner(request({ email: "owner@example.com", username: "owner", password: "correct horse battery staple" }), env(db), "req-1", json);
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.created, true);
    assert.equal(body.owner.role, "OWNER");
    assert.equal(body.owner.status, "ACTIVE");
    assert.equal("password" in body.owner, false);
    assert.ok(db.calls.some((call) => call.sql.includes("CREATE TABLE IF NOT EXISTS sessions")));
  });

  it("creates an owner against the historical external_id/display_name users schema", async () => {
    const db = createDb({}, true);
    const response = await setupOwner(request({ email: "owner@example.com", username: "owner", password: "correct horse battery staple" }), env(db), "req-legacy", json);
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.created, true);
    const insert = db.calls.find((call) => call.op === "run" && call.sql.startsWith("INSERT INTO users"));
    assert.ok(insert);
    assert.match(insert.sql, /external_id/);
    assert.match(insert.sql, /display_name/);
    assert.match(insert.params[insert.params.length - 2], /^OWNER$/);
  });

  it("rejects setup when an owner already exists", async () => {
    const db = createDb({ owner: { id: "owner-1" } });
    const response = await setupOwner(request({ email: "owner@example.com", password: "correct horse battery staple" }), env(db), "req-2", json);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "OWNER_ALREADY_EXISTS");
  });

  it("rejects an invalid setup secret", async () => {
    const db = createDb();
    const invalid = new Request("https://frezen.test/api/v1/setup/owner", {
      method: "POST",
      headers: { "content-type": "application/json", "x-frezen-setup-secret": "wrong" },
      body: JSON.stringify({ email: "owner@example.com", password: "correct horse battery staple" }),
    });
    const response = await setupOwner(invalid, env(db), "req-3", json);
    assert.equal(response.status, 401);
  });
});