import { describe, expect, it } from "vitest";
import { getKeyPage, listPublicProducts, claimPublicKey } from "../src/get-key.js";

const db = {
  prepare(sql) {
    return {
      bind() { return this; },
      async all() {
        if (sql.includes("FROM products WHERE status = 'ACTIVE'")) {
          return { results: [{ id: "p1", name: "Demo", description: "Demo product", version: "1.0.0" }] };
        }
        return { results: [] };
      },
      async first() { return { id: "p1", status: "ACTIVE" }; },
    };
  },
};

describe("Phase 22 — Get Key", () => {
  it("serves the public get-key page without authentication", async () => {
    const response = await getKeyPage("req-page");
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("FREZEN");
    expect(body).toContain("SafeLinkU verification");
  });

  it("lists only active public products without sensitive fields", async () => {
    const response = await listPublicProducts({ DB: db }, "req-products");
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.products).toEqual([{ id: "p1", name: "Demo", description: "Demo product", version: "1.0.0" }]);
    expect(JSON.stringify(data)).not.toContain("key_hash");
    expect(JSON.stringify(data)).not.toContain("license_key");
  });

  it("fails closed when SafeLinkU claim is not configured", async () => {
    const response = await claimPublicKey({ json: async () => ({ product_id: "p1" }) }, { DB: db }, "req-claim");
    const data = await response.json();
    expect(response.status).toBe(501);
    expect(data.error).toBe("SAFELINKU_CLAIM_ENDPOINT_NOT_CONFIGURED");
    expect(data.license_key).toBeUndefined();
  });
});