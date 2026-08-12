import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const TOKEN = "phase15-test-token";
const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const STATUSES = new Set(["unused", "active", "expired", "revoked", "banned"]);

function createDb(rows = []) {
  const licenses = rows.map((row) => ({ ...row }));
  const statement = (sql, values = []) => ({
    first: async () => {
      if (sql.includes("SELECT COUNT(*) AS total FROM licenses")) return { total: filtered(sql, values).length };
      throw new Error(`Unexpected first SQL: ${sql}`);
    },
    all: async () => {
      if (!sql.includes("SELECT l.id, l.user_id")) throw new Error(`Unexpected all SQL: ${sql}`);
      const pageSize = Number(values.at(-2));
      const offset = Number(values.at(-1));
      return { results: filtered(sql, values).slice(offset, offset + pageSize) };
    },
    run: async () => ({ meta: { changes: 1 } }),
  });
  const filtered = (sql, values) => {
    let result = [...licenses];
    if (sql.includes("l.status = ?")) {
      const status = values.find((value) => STATUSES.has(value));
      result = result.filter((row) => row.status === status);
    }
    if (sql.includes("l.product_id = ?")) {
      const productId = values.find((value) => typeof value === "string" && value.startsWith("p"));
      result = result.filter((row) => row.product_id === productId);
    }
    if (sql.includes("l.id LIKE ?")) {
      const patterns = values.filter((value) => typeof value === "string" && value.startsWith("%")).map((value) => value.slice(1, -1).toLowerCase());
      result = result.filter((row) => patterns.some((pattern) => [row.id, row.user_id, row.username, row.email, row.product_id, row.product_name].some((value) => String(value ?? "").toLowerCase().includes(pattern))));
    }
    return result;
  };
  return { prepare(sql) { return { ...statement(sql), bind: (...values) => statement(sql, values) }; } };
}

const env = { FREZEN_ENV: "test", FREZEN_API_TOKEN: TOKEN, AUTH_ROLE: "ADMIN" };
const request = (path) => new Request(`https://frezen.test${path}`, { headers });

const sample = [
  { id: "l1", user_id: "u1", username: "alice", email: "alice@example.test", product_id: "p1", product_name: "Frezen Pro", status: "active", expires_at: "2030-01-01T00:00:00.000Z", created_at: "2026-01-02T00:00:00.000Z", max_devices: 2, last_seen: null, redeem_count: 1, reset_count: 0 },
  { id: "l2", user_id: null, username: null, email: null, product_id: "p2", product_name: "Frezen Basic", status: "unused", expires_at: null, created_at: "2026-01-01T00:00:00.000Z", max_devices: 1, last_seen: null, redeem_count: 0, reset_count: 0 },
  { id: "l3", user_id: "u2", username: "bob", email: "bob@example.test", product_id: "p1", product_name: "Frezen Pro", status: "revoked", expires_at: "2027-01-01T00:00:00.000Z", created_at: "2025-12-01T00:00:00.000Z", max_devices: 1, last_seen: null, redeem_count: 1, reset_count: 1 },
];

describe("Frezen Phase 15 license management", () => {
  it("requires authentication for license listing", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/licenses"), { ...env, DB: createDb(sample) });
    expect(response.status).toBe(401);
  });

  it("lists licenses with pagination metadata and never exposes the license hash", async () => {
    const response = await worker.fetch(request("/api/v1/licenses?page=1&page_size=2"), { ...env, DB: createDb(sample) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.licenses).toHaveLength(2);
    expect(data.pagination).toEqual({ page: 1, page_size: 2, total: 3, total_pages: 2 });
    expect(data.licenses[0]).not.toHaveProperty("license_key_hash");
  });

  it("filters by status", async () => {
    const response = await worker.fetch(request("/api/v1/licenses?status=revoked"), { ...env, DB: createDb(sample) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.licenses).toHaveLength(1);
    expect(data.licenses[0].status).toBe("revoked");
  });

  it("searches license identifiers and user/product metadata", async () => {
    const response = await worker.fetch(request("/api/v1/licenses?q=alice"), { ...env, DB: createDb(sample) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.licenses).toHaveLength(1);
    expect(data.licenses[0].id).toBe("l1");
  });

  it("rejects invalid pagination and status values", async () => {
    const db = createDb(sample);
    expect((await worker.fetch(request("/api/v1/licenses?page=0"), { ...env, DB: db })).status).toBe(400);
    expect((await worker.fetch(request("/api/v1/licenses?page_size=100"), { ...env, DB: db })).status).toBe(400);
    expect((await worker.fetch(request("/api/v1/licenses?status=unknown"), { ...env, DB: db })).status).toBe(400);
  });
});
