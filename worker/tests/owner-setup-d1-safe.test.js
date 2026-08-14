import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { setupOwner } from "../src/security/owner-setup.js";

const json = (data, status) => new Response(JSON.stringify(data), { status });

function createDb({ owner = null, email = null, username = null } = {}) {
  const calls = [];
  const columns = new Set(["id", "email", "username", "password_hash", "role", "status", "last_login_at"]);
  return {
    calls,
    prepare(sql) {
      const run = async (...params) => {
        calls.push({ sql, params, op: "run" });
        return { success: true, meta: { changes: 1 } };
      };
      const all = async (...params) => {
        calls.push({ sql, params, op: "all" });
        if (sql.includes("PRAGMA table_info(users)")) return { results: [...columns].map((name) => ({ name })) };
        return { results: [] };
      };
      const first = async (...params) => {
        calls.push({ sql, params, op: "first" });
        if (sql.includes("role = ?1")) return owner;
        if (sql.includes("email = ?1")) return email;
        if (sql.includes("username = ?1")) return username;
        return null;
      };
      return {
        run,
        all,
        bind(...params) {
          return { run: () => run(...params), all: () => all(...params), first: () => first(...params) };
        },
      };
    },
  };
}

const env = DB => ({
  DB,
  FREZEN_MASTER_SECRET: "x".repeat(32),
  OWNER_EMAIL: "owner@example.com",
  OWNER_BOOTSTRAP_USERNAME: "owner",
  OWNER_BOOTSTRAP_PASSWORD: "correct horse battery staple",
});

const request = new Request("https://frezen.test/api/v1/setup/owner", {
  method: "POST",
  headers: { "x-frezen-setup-secret": "x".repeat(32) },
});

describe("safe owner bootstrap", () => {
  it("does not modify D1 schema during setup", async () => {
    const db = createDb();
    const response = await setupOwner(request.clone(), env(db), "safe-schema", json);
    assert.equal(response.status, 201);
    assert.ok(db.calls.some((call) => call.sql.includes("PRAGMA table_info(users)")));
    assert.ok(db.calls.every((call) => !/\b(?:ALTER TABLE|CREATE TABLE|CREATE INDEX|DROP TABLE|DROP INDEX|TRUNCATE)\b/i.test(call.sql)));
  });

  it("returns a conflict instead of a generic database error for an existing username", async () => {
    const db = createDb({ username: { id: "existing-user" } });
    const response = await setupOwner(request.clone(), env(db), "username-conflict", json);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "USERNAME_ALREADY_EXISTS");
  });
});
