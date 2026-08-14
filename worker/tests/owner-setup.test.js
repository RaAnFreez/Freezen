import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { setupOwner } from "../src/security/owner-setup.js";

const json = (data, status) => new Response(JSON.stringify(data), { status });

const createDb = ({ owner = null, email = null, username = null, legacy = false } = {}) => {
  const calls = [];
  const columns = new Set(legacy
    ? ["id", "external_id", "display_name", "created_at", "updated_at"]
    : ["id", "email", "username", "password_hash", "role", "status", "last_login_at"]);
  return {
    calls,
    prepare(sql) {
      const execute = async (...params) => {
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
        run: execute,
        all,
        bind(...params) {
          return { run: () => execute(...params), all: () => all(...params), first: () => first(...params) };
        },
      };
    },
  };
};

const env = (DB, extra = {}) => ({
  DB,
  FREZEN_MASTER_SECRET: "x".repeat(32),
  OWNER_EMAIL: "owner@example.com",
  OWNER_BOOTSTRAP_USERNAME: "owner",
  OWNER_BOOTSTRAP_PASSWORD: "correct horse battery staple",
  ...extra,
});

const request = (secret = "x".repeat(32), body = undefined) => new Request("https://frezen.test/api/v1/setup/owner", {
  method: "POST",
  headers: { "content-type": "application/json", "x-frezen-setup-secret": secret },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe("Private owner bootstrap", () => {
  it("creates exactly one OWNER using Worker secrets", async () => {
    const db = createDb();
    const response = await setupOwner(request(), env(db), "req-1", json);
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.created, true);
    assert.equal(body.owner.role, "OWNER");
    assert.equal(body.owner.status, "ACTIVE");
    assert.equal(body.owner.email, "owner@example.com");
    assert.equal(body.owner.username, "owner");
    assert.equal("password" in body.owner, false);
    const insert = db.calls.find((call) => call.op === "run" && call.sql.startsWith("INSERT INTO users"));
    assert.ok(insert);
    assert.notEqual(insert.params[3], env(db).OWNER_BOOTSTRAP_PASSWORD);
    assert.ok(db.calls.every((call) => !/\b(?:ALTER TABLE|CREATE TABLE|CREATE INDEX|DROP TABLE|DROP INDEX|TRUNCATE)\b/i.test(call.sql)));
  });

  it("blocks the historical users schema without modifying D1", async () => {
    const db = createDb({ legacy: true });
    const response = await setupOwner(request(), env(db), "req-legacy", json);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error, "USERS_SCHEMA_INCOMPATIBLE");
    assert.equal(body.stage, "users-schema");
    assert.ok(db.calls.some((call) => call.sql.includes("PRAGMA table_info(users)")));
    assert.ok(db.calls.every((call) => !/\b(?:ALTER TABLE|CREATE TABLE|CREATE INDEX|DROP TABLE|DROP INDEX|TRUNCATE)\b/i.test(call.sql)));
  });

  it("rejects setup when an owner already exists", async () => {
    const db = createDb({ owner: { id: "owner-1" } });
    const response = await setupOwner(request(), env(db), "req-2", json);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "OWNER_ALREADY_EXISTS");
  });

  it("rejects an invalid setup secret", async () => {
    const db = createDb();
    const response = await setupOwner(request("wrong"), env(db), "req-3", json);
    assert.equal(response.status, 401);
  });

  it("does not accept a bootstrap password from the request body", async () => {
    const db = createDb();
    const response = await setupOwner(
      request("x".repeat(32), { password: "attacker-controlled-password", username: "attacker", email: "attacker@example.com" }),
      env(db),
      "req-body",
      json,
    );
    assert.equal(response.status, 201);
    const insert = db.calls.find((call) => call.op === "run" && call.sql.startsWith("INSERT INTO users"));
    assert.ok(insert);
    assert.equal(insert.params[1], "owner@example.com");
    assert.equal(insert.params[2], "owner");
    assert.notEqual(insert.params[3], "attacker-controlled-password");
    assert.ok(insert.params[3].startsWith("pbkdf2$sha256$100000$"));
  });
});
