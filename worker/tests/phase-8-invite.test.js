import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createInvite, redeemInvite, updateInvite } from "../src/security/invite.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const responseBody = async (response) => response.json();

const makeDb = ({ invite = null, users = [] } = {}) => {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      const state = { sql, binds: [] };
      return {
        bind(...args) { state.binds = args; return this; },
        async first() {
          if (sql.includes("SELECT id, role, expires_at")) return invite;
          if (sql.includes("SELECT id FROM users WHERE email")) return users[0] ?? null;
          return null;
        },
        async all() { return { results: invite ? [invite] : [] }; },
        async run() { statements.push(state); return { meta: { changes: 1 } }; },
      };
    },
    async batch(items) {
      items.forEach((item) => statements.push(item));
      return items.map(() => ({ meta: { changes: 1 } }));
    },
  };
};

describe("Phase 8 invite lifecycle", () => {
  it("requires OWNER to create an invite", async () => {
    const response = await createInvite(new Request("https://example.test", { method: "POST", body: JSON.stringify({ role: "SUPPORT" }) }), { DB: makeDb() }, "req", json, { user_id: "u1", role: "ADMIN" });
    assert.equal(response.status, 403);
  });

  it("creates a cryptographically random invite and never returns its hash", async () => {
    const db = makeDb();
    const response = await createInvite(new Request("https://example.test", { method: "POST", body: JSON.stringify({ role: "ADMIN", max_uses: 2, expires_in_hours: 24 }) }), { DB: db }, "req", json, { user_id: "owner", role: "OWNER" });
    assert.equal(response.status, 201);
    const body = await responseBody(response);
    assert.match(body.invite.code, /^[a-f0-9]{48}$/);
    assert.equal(body.invite.role, "ADMIN");
    assert.equal("code_hash" in body.invite, false);
  });

  it("rejects invalid invite roles", async () => {
    const response = await createInvite(new Request("https://example.test", { method: "POST", body: JSON.stringify({ role: "OWNER" }) }), { DB: makeDb() }, "req", json, { user_id: "owner", role: "OWNER" });
    assert.equal(response.status, 400);
  });

  it("rejects an already-used invite", async () => {
    const invite = { id: "i1", role: "SUPPORT", expires_at: null, max_uses: 1, used_count: 1, status: "ACTIVE" };
    const response = await redeemInvite(new Request("https://example.test", { method: "POST", body: JSON.stringify({ code: "abc", email: "user@example.com", password: "long-password-123" }) }), { DB: makeDb({ invite }) }, "req", json);
    assert.equal(response.status, 409);
    assert.equal((await responseBody(response)).error, "INVITE_USED");
  });

  it("rejects an expired invite", async () => {
    const invite = { id: "i1", role: "SUPPORT", expires_at: new Date(Date.now() - 60_000).toISOString(), max_uses: 1, used_count: 0, status: "ACTIVE" };
    const response = await redeemInvite(new Request("https://example.test", { method: "POST", body: JSON.stringify({ code: "abc", email: "user@example.com", password: "long-password-123" }) }), { DB: makeDb({ invite }) }, "req", json);
    assert.equal(response.status, 409);
    assert.equal((await responseBody(response)).error, "INVITE_EXPIRED");
  });

  it("allows OWNER to revoke an active invite", async () => {
    const response = await updateInvite(new Request("https://example.test", { method: "PATCH", body: JSON.stringify({ status: "REVOKED" }) }), { DB: makeDb() }, "req", json, { user_id: "owner", role: "OWNER" }, "invite-1");
    assert.equal(response.status, 200);
    assert.equal((await responseBody(response)).status, "REVOKED");
  });
});
