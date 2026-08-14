import { describe, expect, it } from "vitest";
import worker from "../src/index.js";
import { hashPassword, verifyPassword, sessionCookie, clearSessionCookie } from "../src/security/session-auth.js";

const makeDb = async () => {
  const passwordHash = await hashPassword("Correct Horse Battery 123!");
  const state = {
    user: { id: "user-1", email: "owner@example.com", username: "owner", password_hash: passwordHash, role: "OWNER", status: "ACTIVE" },
    sessions: [],
    resets: [],
    rate: new Map(),
  };
  return {
    state,
    prepare(sql) {
      return {
        bind: (...params) => ({
          first: async () => {
            if (sql.includes("FROM users WHERE email")) return state.user?.email === params[0] ? state.user : null;
            if (sql.includes("FROM users WHERE id")) return state.user?.id === params[0] ? state.user : null;
            if (sql.includes("FROM sessions s JOIN users")) return state.sessions.find((s) => s.token_hash === params[0] && !s.revoked_at) ?? null;
            if (sql.includes("FROM sessions WHERE user_id")) return state.sessions[0] ?? null;
            if (sql.includes("FROM auth_rate_limits")) return state.rate.get(params[0]) ?? null;
            if (sql.includes("FROM password_reset_tokens")) return state.resets.find((r) => r.token_hash === params[0]) ?? null;
            return null;
          },
          all: async () => ({ results: state.sessions }),
          run: async () => {
            if (sql.startsWith("INSERT INTO sessions")) {
              state.sessions.push({ id: params[0], user_id: params[1], token_hash: params[2], expires_at: params[3], revoked_at: null });
            }
            if (sql.startsWith("UPDATE sessions SET revoked_at") && sql.includes("WHERE user_id")) state.sessions.forEach((s) => { if (s.user_id === params[0]) s.revoked_at = new Date().toISOString(); });
            if (sql.startsWith("UPDATE sessions SET last_seen_at")) state.sessions.forEach((s) => { if (s.id === params[0]) s.last_seen_at = new Date().toISOString(); });
            return { meta: { changes: 1 } };
          },
        }),
      };
    },
  };
};

describe("Phase 5 Authentication", () => {
  it("hashes and verifies passwords without storing plaintext", async () => {
    const hash = await hashPassword("Correct Horse Battery 123!");
    expect(hash).toMatch(/^pbkdf2\$sha256\$100000\$/);
    expect(hash).not.toContain("Correct Horse Battery 123!");
    expect(await verifyPassword("Correct Horse Battery 123!", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("sets secure HttpOnly SameSite session cookies", () => {
    const cookie = sessionCookie("test-token");
    expect(cookie).toContain("__Host-frezen_session=test-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(clearSessionCookie()).toContain("Max-Age=0");
  });

  it("rejects login when D1 is unavailable", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "owner@example.com", password: "Correct Horse Battery 123!" }), headers: { "content-type": "application/json" } }), { FREZEN_ENV: "test" });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("DATABASE_UNAVAILABLE");
  });

  it("rejects malformed login input", async () => {
    const db = await makeDb();
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "", password: "x" }), headers: { "content-type": "application/json" } }), { FREZEN_ENV: "test", DB: db });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("INVALID_CREDENTIALS");
  });

  it("requires a session for production auth verification", async () => {
    const db = await makeDb();
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/auth/verify"), { FREZEN_ENV: "production", DB: db });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("UNAUTHENTICATED");
  });
});
