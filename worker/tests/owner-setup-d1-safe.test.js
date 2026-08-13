import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { setupOwner } from "../src/security/owner-setup.js";

const json = (data, status) => new Response(JSON.stringify(data), { status });

function createDb({ owner = null, email = null, username = null } = {}) {
  const calls = [];
  const columns = new Set(["id", "external_id", "display_name", "created_at", "updated_at"]);
  return {
    calls,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              calls.push({ sql, params, op: "first" });
              if (sql.includes("role = ?1")) return owner;
              if (sql.includes("email = ?1")) return email;
              if (sql.includes("username = ?1")) return username;
              return null;
            },
            async all() {
              calls.push({ sql, params, op: "all" });
              if (sql.includes("PRAGMA table_info(users)")) return { results: [...columns].map(name => ({ name })) };
              return { results: [] };
            },
            async run() {
              calls.push({ sql, params, op: "run" });
              const alter = sql.match(/^ALTER TABLE users ADD COLUMN (\w+)/i);
              if (alter) columns.add(alter[1]);
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

const env = DB => ({ DB, FREZEN_MASTER_SECRET: "x".repeat(32), OWNER_EMAIL: "owner@example.com" });
const request = body => new Request("https://frezen.test/api/v1/setup/owner", {
  method: "POST",
  headers: { "content-type": "application/json", "x-frezen-setup-secret": "x".repeat(32) },
  body: JSON.stringify(body),
});

describe("safe owner setup", () => {
  it("does not rebuild unique indexes during setup", async () => {
    const db = createDb();
    const response = await setupOwner(request({ email: "owner@example.com", username: "owner", password: "correct horse battery staple" }), env(db), "safe-index", json);
    assert.equal(response.status, 201);
    assert.ok(db.calls.some(call => call.sql.includes("CREATE INDEX IF NOT EXISTS idx_users_email_owner_setup ON users(email)")));
    assert.ok(db.calls.some(call => call.sql.includes("CREATE INDEX IF NOT EXISTS idx_users_username_owner_setup ON users(username)")));
    assert.ok(db.calls.every(call => !call.sql.includes("CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_owner_setup")));
    assert.ok(db.calls.every(call => !call.sql.includes("CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username_owner_setup")));
  });

  it("returns a conflict instead of a generic database error for an existing username", async () => {
    const db = createDb({ username: { id: "legacy-user" } });
    const response = await setupOwner(request({ email: "owner@example.com", username: "owner", password: "correct horse battery staple" }), env(db), "username-conflict", json);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "USERNAME_ALREADY_EXISTS");
  });
});
