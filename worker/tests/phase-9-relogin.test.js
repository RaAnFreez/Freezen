import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const sessionCookie = "__Host-frezen_session=valid-session";
const mockDb = (session = null) => ({
  prepare() {
    return { bind() { return { first: async () => session, run: async () => ({ meta: { changes: 1 } }), all: async () => ({ results: [] }) }; } };
  },
});

describe("Phase 9 — Team re-login", () => {
  it("redirects an already authenticated user to /dashboard", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json", cookie: sessionCookie }, body: JSON.stringify({ email: "ignored@example.com", password: "ignored-password" }) }), { FREZEN_ENV: "test", DB: mockDb({ user_id: "user-1", email: "member@example.com", username: "member", role: "SUPPORT", status: "ACTIVE", expires_at: "2099-01-01T00:00:00.000Z" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.already_authenticated).toBe(true);
    expect(body.redirect_to).toBe("/dashboard");
    expect(body.user.role).toBe("SUPPORT");
  });

  it("logout returns the client to /login and clears the cookie", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/auth/logout", { method: "POST", headers: { cookie: sessionCookie } }), { FREZEN_ENV: "test", DB: mockDb({ id: "session-1", user_id: "user-1" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).redirect_to).toBe("/login");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("does not expose password hashes or session tokens", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json", cookie: sessionCookie }, body: JSON.stringify({ email: "ignored@example.com", password: "ignored-password" }) }), { FREZEN_ENV: "test", DB: mockDb({ user_id: "user-1", email: "member@example.com", username: "member", role: "ADMIN", status: "ACTIVE", expires_at: "2099-01-01T00:00:00.000Z" }) });
    const text = await response.text();
    expect(text).not.toContain("password_hash");
    expect(text).not.toContain("valid-session");
  });
});
