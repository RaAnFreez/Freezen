import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const TOKEN = "phase13-test-token";
const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

function createDb(initial = []) {
  const products = new Map(initial.map((product) => [product.id, { ...product }]));
  const licenses = new Set();
  const scripts = new Set();

  const statement = (sql, values = []) => ({
    all: async () => {
      if (sql.includes("FROM products WHERE status =")) {
        return { results: [...products.values()].filter((p) => p.status === values[0]) };
      }
      if (sql.includes("FROM products ORDER BY")) return { results: [...products.values()] };
      throw new Error(`Unexpected all SQL: ${sql}`);
    },
    first: async () => {
      if (sql.includes("SELECT id FROM products WHERE lower(name) = lower(?1) AND id != ?2")) {
        return [...products.values()].find((p) => p.name.toLowerCase() === String(values[0]).toLowerCase() && p.id !== values[1]) ?? null;
      }
      if (sql.includes("SELECT id FROM products WHERE lower(name) = lower(?1)")) {
        return [...products.values()].find((p) => p.name.toLowerCase() === String(values[0]).toLowerCase()) ?? null;
      }
      if (sql.includes("SELECT id, name, description, version, status, created_at, updated_at FROM products WHERE id")) {
        return products.get(values[0]) ?? null;
      }
      if (sql.includes("SELECT id FROM products WHERE id")) return products.has(values[0]) ? { id: values[0] } : null;
      if (sql.includes("SELECT (SELECT COUNT(*) FROM licenses")) {
        return { licenses: licenses.has(values[0]) ? 1 : 0, scripts: scripts.has(values[0]) ? 1 : 0 };
      }
      throw new Error(`Unexpected first SQL: ${sql}`);
    },
    run: async () => {
      if (sql.includes("INSERT INTO products")) {
        const [id, name, description, version, status] = values;
        products.set(id, { id, name, description, version, status, created_at: "now", updated_at: "now" });
        return { meta: { changes: 1 } };
      }
      if (sql.includes("UPDATE products SET")) {
        const [name, description, version, status, id] = values;
        const current = products.get(id);
        if (!current) return { meta: { changes: 0 } };
        products.set(id, { ...current, name, description, version, status, updated_at: "now" });
        return { meta: { changes: 1 } };
      }
      if (sql.includes("DELETE FROM products")) {
        const changed = products.delete(values[0]) ? 1 : 0;
        return { meta: { changes: changed } };
      }
      if (sql.includes("INSERT INTO audit_logs")) return { meta: { changes: 1 } };
      throw new Error(`Unexpected run SQL: ${sql}`);
    },
  });

  return {
    products,
    licenses,
    scripts,
    prepare(sql) {
      return {
        ...statement(sql),
        bind: (...values) => statement(sql, values),
      };
    },
  };
}

const env = { FREZEN_ENV: "test", FREZEN_API_TOKEN: TOKEN, AUTH_ROLE: "ADMIN" };
const request = (path, method = "GET", body) => new Request(`https://frezen.test${path}`, {
  method,
  headers,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe("Frezen Phase 13 product management", () => {
  it("requires authentication for product listing", async () => {
    const response = await worker.fetch(new Request("https://frezen.test/api/v1/products"), { ...env, DB: createDb() });
    expect(response.status).toBe(401);
  });

  it("lists products", async () => {
    const db = createDb([{ id: "p1", name: "Frezen Basic", description: "Basic", version: "1.0.0", status: "ACTIVE", created_at: "now", updated_at: "now" }]);
    const response = await worker.fetch(request("/api/v1/products"), { ...env, DB: db });
    expect(response.status).toBe(200);
    expect((await response.json()).products).toHaveLength(1);
  });

  it("creates a product", async () => {
    const db = createDb();
    const response = await worker.fetch(request("/api/v1/products", "POST", { name: "Frezen Pro", description: "Pro", version: "1.0.0" }), { ...env, DB: db });
    expect(response.status).toBe(200);
    expect((await response.json()).product.name).toBe("Frezen Pro");
    expect(db.products.size).toBe(1);
  });

  it("rejects duplicate product names case-insensitively", async () => {
    const db = createDb([{ id: "p1", name: "Frezen Pro", description: null, version: null, status: "ACTIVE", created_at: "now", updated_at: "now" }]);
    const response = await worker.fetch(request("/api/v1/products", "POST", { name: "frezen pro" }), { ...env, DB: db });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("PRODUCT_NAME_EXISTS");
  });

  it("updates and disables a product", async () => {
    const db = createDb([{ id: "p1", name: "Frezen Pro", description: "Old", version: "1.0.0", status: "ACTIVE", created_at: "now", updated_at: "now" }]);
    const response = await worker.fetch(request("/api/v1/products/p1", "PATCH", { description: "New", version: "2.0.0", status: "disabled" }), { ...env, DB: db });
    expect(response.status).toBe(200);
    const product = (await response.json()).product;
    expect(product.description).toBe("New");
    expect(product.version).toBe("2.0.0");
    expect(product.status).toBe("DISABLED");
  });

  it("blocks product writes for SUPPORT", async () => {
    const db = createDb();
    const response = await worker.fetch(request("/api/v1/products", "POST", { name: "Nope" }), { ...env, AUTH_ROLE: "SUPPORT", DB: db });
    expect(response.status).toBe(403);
  });

  it("refuses deletion while dependent resources exist", async () => {
    const db = createDb([{ id: "p1", name: "Used", description: null, version: null, status: "ACTIVE", created_at: "now", updated_at: "now" }]);
    db.licenses.add("p1");
    const response = await worker.fetch(request("/api/v1/products/p1", "DELETE"), { ...env, DB: db });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("PRODUCT_IN_USE");
  });

  it("deletes an unused product", async () => {
    const db = createDb([{ id: "p1", name: "Unused", description: null, version: null, status: "DISABLED", created_at: "now", updated_at: "now" }]);
    const response = await worker.fetch(request("/api/v1/products/p1", "DELETE"), { ...env, DB: db });
    expect(response.status).toBe(200);
    expect((await response.json()).deleted).toBe(true);
    expect(db.products.has("p1")).toBe(false);
  });
});
