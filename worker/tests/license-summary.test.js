import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const TOKEN = "phase6-test-token";
const env = { FREZEN_ENV: "test", FREZEN_API_TOKEN: TOKEN };
const headers = { Authorization: `Bearer ${TOKEN}` };

const db = ({ user = { id: "u1", external_id: "demo-external", display_name: "Demo" }, licenses = [] } = {}) => ({
  prepare: (sql) => ({
    bind: () => ({
      first: async () => user,
      all: async () => ({ results: licenses }),
    }),
  }),
});

describe("Frezen Phase 6D user license summary", () => {
  it("requires authentication", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/users/demo-external/licenses"), { ...env, DB: db() });
    expect(response.status).toBe(401);
  });

  it("returns user licenses without exposing license hashes", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/users/demo-external/licenses", { headers }), {
      ...env,
      DB: db({ licenses: [{ id: "l1", status: "active", expires_at: null, created_at: "x", updated_at: "x", license_key_hash: "secret-hash" }] }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.external_id).toBe("demo-external");
    expect(body.licenses).toHaveLength(1);
    expect(body.licenses[0].id).toBe("l1");
    expect(body.licenses[0].license_key_hash).toBeUndefined();
  });

  it("returns USER_NOT_FOUND", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/users/missing/licenses", { headers }), {
      ...env,
      DB: db({ user: null }),
    });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("USER_NOT_FOUND");
  });
});
