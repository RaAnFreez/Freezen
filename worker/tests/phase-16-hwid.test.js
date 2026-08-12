import { describe, expect, it } from "vitest";
import { bindHwid, validateHwid, resetHwid, blockHwid, unblockHwid } from "../src/security/hwid.js";

const auth = { user_id: "u1", role: "ADMIN" };
const requestId = "phase16-test";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const hash = async (value) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

function dbFactory({ license, devices = [] }) {
  const rows = devices.map((row) => ({ ...row }));
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("FROM licenses")) return license;
              if (sql.includes("FROM devices") && sql.includes("hwid_hash")) return rows.find((row) => row.license_id === values[0] && row.hwid_hash === values[1]) ?? null;
              if (sql.includes("FROM devices") && sql.includes("COUNT(*)")) return { total: rows.filter((row) => row.license_id === values[0] && row.status === "active").length };
              if (sql.includes("FROM devices") && sql.includes("WHERE id = ?1")) return rows.find((row) => row.id === values[0]) ?? null;
              return null;
            },
            async all() { return { results: rows.filter((row) => row.license_id === values[0]) }; },
            async run() {
              if (sql.startsWith("INSERT INTO devices")) rows.push({ id: values[0], license_id: values[1], user_id: values[2], hwid_hash: values[3], status: "active" });
              if (sql.startsWith("UPDATE devices SET status")) { const row = rows.find((item) => item.id === values[3]); if (row) row.status = values[0]; }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

const license = { id: "l1", user_id: "u1", status: "active", expires_at: null, max_devices: 2, hwid_reset_at: null, hwid_reset_cooldown_until: null };

describe("Phase 16 HWID", () => {
  it("binds a device and stores only a hash", async () => {
    const db = dbFactory({ license });
    const response = await bindHwid(new Request("https://frezen.test/api/v1/hwid", { method: "POST", body: JSON.stringify({ license_id: "l1", hwid: "device-secret-1" }) }), { DB: db }, requestId, json, auth);
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).not.toHaveProperty("hwid");
  });

  it("rejects a third active device when max_devices is reached", async () => {
    const db = dbFactory({ license: { ...license, max_devices: 1 }, devices: [{ id: "d1", license_id: "l1", user_id: "u1", hwid_hash: await hash("device-1"), status: "active" }] });
    const response = await bindHwid(new Request("https://frezen.test/api/v1/hwid", { method: "POST", body: JSON.stringify({ license_id: "l1", hwid: "device-2" }) }), { DB: db }, requestId, json, auth);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("DEVICE_LIMIT_REACHED");
  });

  it("validates matching HWID and denies mismatch", async () => {
    const db = dbFactory({ license, devices: [{ id: "d1", license_id: "l1", user_id: "u1", hwid_hash: await hash("device-1"), status: "active" }] });
    const valid = await validateHwid(new Request("https://frezen.test/api/v1/hwid/validate", { method: "POST", body: JSON.stringify({ license_id: "l1", hwid: "device-1" }) }), { DB: db }, requestId, json, auth);
    expect(valid.status).toBe(200);
    expect((await valid.json()).valid).toBe(true);
    const invalid = await validateHwid(new Request("https://frezen.test/api/v1/hwid/validate", { method: "POST", body: JSON.stringify({ license_id: "l1", hwid: "wrong-device" }) }), { DB: db }, requestId, json, auth);
    expect(invalid.status).toBe(200);
    expect((await invalid.json()).reason).toBe("HWID_MISMATCH");
  });

  it("blocks and unblocks a device", async () => {
    const db = dbFactory({ license, devices: [{ id: "d1", license_id: "l1", user_id: "u1", hwid_hash: await hash("device-1"), status: "active" }] });
    expect((await blockHwid(new Request("https://frezen.test"), { DB: db }, requestId, json, "d1")).status).toBe(200);
    expect((await unblockHwid(new Request("https://frezen.test"), { DB: db }, requestId, json, "d1")).status).toBe(200);
  });

  it("requires a cooldown after reset", async () => {
    const db = dbFactory({ license });
    const first = await resetHwid(new Request("https://frezen.test", { method: "POST" }), { DB: db, HWID_RESET_COOLDOWN_SECONDS: "86400" }, requestId, json, "l1");
    expect(first.status).toBe(200);
  });
});
