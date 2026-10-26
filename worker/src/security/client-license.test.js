import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bindHwidV2: vi.fn(),
  validateHwidV2: vi.fn(),
}));

vi.mock("./hwid-v2.js", () => mocks);

import { validateClientLicense } from "./client-license.js";

const makeJson = () => (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const makeRequest = (payload) => new Request("https://frezen.example/api/v1/client/license/validate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: typeof payload === "string" ? payload : JSON.stringify(payload),
});

function makeDb({ license = null, product = { id: "product-1", status: "ACTIVE" } } = {}) {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      statements.push(sql);
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("FROM licenses WHERE license_key_hash")) return license;
              if (sql.includes("FROM products WHERE id")) return product;
              return null;
            },
            async run() { return { success: true, meta: { changes: 1 }, values }; },
          };
        },
      };
    },
  };
}

const validPayload = { product_id: "product-1", license_key: "FREZEN-TEST-KEY", hwid: "device-fingerprint-example" };
const activeLicense = {
  id: "license-1",
  product_id: "product-1",
  status: "active",
  expires_at: null,
  max_devices: 1,
};

describe("Frezen client license validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateHwidV2.mockResolvedValue({
      ok: true,
      existing: true,
      deviceId: "device-1",
      fingerprint: "abcdef123456",
    });
    mocks.bindHwidV2.mockResolvedValue({
      ok: true,
      existing: false,
      deviceId: "device-1",
      fingerprint: "abcdef123456",
    });
  });

  it("fails closed when D1 is unavailable", async () => {
    const response = await validateClientLicense(makeRequest(validPayload), {}, "req-1", makeJson());
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe("DATABASE_UNAVAILABLE");
  });

  it("rejects malformed JSON and missing fields", async () => {
    const DB = makeDb({ license: activeLicense });
    const malformed = await validateClientLicense(makeRequest("{"), { DB }, "req-2", makeJson());
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).reason).toBe("INVALID_JSON");

    const missing = await validateClientLicense(makeRequest({ license_key: "key" }), { DB }, "req-3", makeJson());
    expect(missing.status).toBe(400);
    expect((await missing.json()).reason).toBe("INVALID_PRODUCT_ID");

    const oversized = await validateClientLicense(makeRequest({ ...validPayload, hwid: "x".repeat(513) }), { DB }, "req-3b", makeJson());
    expect(oversized.status).toBe(400);
    expect((await oversized.json()).reason).toBe("INVALID_HWID");
  });

  it("rejects unknown and non-active licenses", async () => {
    const unknown = await validateClientLicense(makeRequest(validPayload), { DB: makeDb() }, "req-4", makeJson());
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).reason).toBe("LICENSE_NOT_FOUND");

    const revoked = await validateClientLicense(makeRequest(validPayload), {
      DB: makeDb({ license: { ...activeLicense, status: "revoked" } }),
    }, "req-5", makeJson());
    expect(revoked.status).toBe(403);
    expect((await revoked.json()).reason).toBe("LICENSE_REVOKED");
  });

  it("rejects mismatched products and disabled products", async () => {
    const mismatch = await validateClientLicense(makeRequest(validPayload), {
      DB: makeDb({ license: { ...activeLicense, product_id: "other-product" } }),
    }, "req-6", makeJson());
    expect(mismatch.status).toBe(403);
    expect((await mismatch.json()).reason).toBe("PRODUCT_LICENSE_MISMATCH");

    const disabled = await validateClientLicense(makeRequest(validPayload), {
      DB: makeDb({ license: activeLicense, product: { id: "product-1", status: "DISABLED" } }),
    }, "req-7", makeJson());
    expect(disabled.status).toBe(403);
    expect((await disabled.json()).reason).toBe("PRODUCT_DISABLED");
  });

  it("rejects expired licenses", async () => {
    const response = await validateClientLicense(makeRequest(validPayload), {
      DB: makeDb({ license: { ...activeLicense, expires_at: "2000-01-01T00:00:00.000Z" } }),
    }, "req-8", makeJson());
    expect(response.status).toBe(403);
    expect((await response.json()).reason).toBe("LICENSE_EXPIRED");
  });

  it("validates an already-bound device without exposing the key or raw HWID", async () => {
    const response = await validateClientLicense(makeRequest(validPayload), {
      DB: makeDb({ license: activeLicense }),
    }, "req-9", makeJson());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.valid).toBe(true);
    expect(body.license.lifetime).toBe(true);
    expect(body.device.bound).toBe(true);
    expect(body.license_key).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(validPayload.hwid);
    expect(mocks.bindHwidV2).not.toHaveBeenCalled();
  });

  it("binds a device on its first validation", async () => {
    mocks.validateHwidV2.mockResolvedValue({ ok: false, reason: "HWID_MISMATCH" });
    const response = await validateClientLicense(makeRequest(validPayload), {
      DB: makeDb({ license: activeLicense }),
    }, "req-10", makeJson());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.valid).toBe(true);
    expect(body.device.newly_bound).toBe(true);
    expect(mocks.bindHwidV2).toHaveBeenCalledWith(expect.anything(), {
      licenseId: "license-1",
      rawHwid: validPayload.hwid,
    });
  });

  it("rejects blocked devices and device-limit failures", async () => {
    mocks.validateHwidV2.mockResolvedValue({ ok: false, reason: "HWID_MISMATCH" });
    mocks.bindHwidV2.mockResolvedValue({ ok: false, reason: "DEVICE_LIMIT_REACHED" });
    const response = await validateClientLicense(makeRequest(validPayload), {
      DB: makeDb({ license: activeLicense }),
    }, "req-11", makeJson());
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe("DEVICE_LIMIT_REACHED");
  });
});
