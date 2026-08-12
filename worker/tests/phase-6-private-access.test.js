import { describe, expect, it } from "vitest";
import worker from "../src/index.js";
import { createSession, hashPassword } from "../src/security/session-auth.js";

const makeDb = async (status = "ACTIVE") => {
  const passwordHash = await hashPassword("Correct Horse Battery 123!");
  const state = {
    user: {
      id: "user-1",
      email: "owner@example.com",
      username: "owner",
      password_hash: passwordHash,
      role: "OWNER",
      status,
    },
    sessions: [],
  };

  const db = {
    state,
    prepare(sql) {
      return {
        bind: (...params) => ({
          first: async () => {
            if (sql.includes("FROM sessions s JOIN users")) {
              return state.sessions.find((session) =>
                session.token_hash === params[0]
                && !session.revoked_at
              )
                ? { ...state.sessions.find((session) => session.token_hash === params[0]), ...state.user }
                : null;
            }
            return null;
          },
          run: async () => {
            if (sql.startsWith("INSERT INTO sessions")) {
              state.sessions.push({
                id: params[0],
                user_id: params[1],
                token_hash: params[2],
                expires_at: params[3],
                revoked_at: null,
              });
            }
            if (sql.startsWith("UPDATE sessions SET revoked_at")) {
              const session = state.sessions.find((item) => item.id === params[0]);
              if (session) session.revoked_at = new Date().toISOString();
            }
            if (sql.startsWith("UPDATE sessions SET last_seen_at")) {
              const session = state.sessions.find((item) => item.id === params[0]);
              if (session) session.last_seen_at = new Date().toISOString();
            }
            return { meta: { changes: 1 } };
          },
        }),
      };
    },
  };

  return db;
};

const authenticatedRequest = async (db) => {
  const session = await createSession(db, db.state.user.id);
  return new Request("https://frezen.test/dashboard", {
    headers: { cookie: `__Host-frezen_session=${session.token}` },
  });
};

describe("Phase 6 Private Access", () => {
  it("returns 401 for an unauthenticated dashboard request", async () => {
    const db = await makeDb();
    const response = await worker.fetch(
      new Request("https://frezen.test/dashboard"),
      { FREZEN_ENV: "production", DB: db },
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("UNAUTHENTICATED");
    expect(body.message).toBe("You can't access this link");
  });

  it("returns 403 for an authenticated account without active access", async () => {
    const db = await makeDb("SUSPENDED");
    const request = await authenticatedRequest(db);
    const response = await worker.fetch(request, { FREZEN_ENV: "production", DB: db });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("ACCESS_DENIED");
    expect(body.message).toBe("Access Denied");
  });

  it("allows an active authenticated account into the private dashboard boundary", async () => {
    const db = await makeDb("ACTIVE");
    const request = await authenticatedRequest(db);
    const response = await worker.fetch(request, { FREZEN_ENV: "production", DB: db });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.private).toBe(true);
    expect(body.status).toBe("authorized");
    expect(body.user.id).toBe("user-1");
    expect(body.user.username).toBe("owner");
    expect(body).not.toHaveProperty("invites");
    expect(body).not.toHaveProperty("secrets");
  });

  it("protects nested dashboard paths with the same server-side boundary", async () => {
    const db = await makeDb();
    const session = await createSession(db, db.state.user.id);
    const response = await worker.fetch(
      new Request("https://frezen.test/dashboard/licenses", {
        headers: { cookie: `__Host-frezen_session=${session.token}` },
      }),
      { FREZEN_ENV: "production", DB: db },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).private).toBe(true);
  });

  it("protects the API dashboard boundary", async () => {
    const db = await makeDb();
    const response = await worker.fetch(
      new Request("https://frezen.test/api/v1/dashboard"),
      { FREZEN_ENV: "production", DB: db },
    );

    expect(response.status).toBe(401);
  });

  it("does not expose a public registration endpoint", async () => {
    const db = await makeDb();
    const response = await worker.fetch(
      new Request("https://frezen.test/api/v1/auth/register", { method: "POST" }),
      { FREZEN_ENV: "production", DB: db },
    );

    expect(response.status).toBe(404);
  });
});
