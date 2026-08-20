import { describe, expect, it } from "vitest";
import { bindHwidV2, validateHwidV2, setHwidStatusV2, resetHwidV2 } from "../src/security/hwid-v2.js";

function makeDb({ license = { id: "lic-1", user_id: "owner-1", status: "active", expires_at: null }, maxDevices = 1 } = {}) {
  const bindings = new Map();
  let inserts = 0;

  const prepare = (sql) => {
    let params = [];
    const statement = {
      bind(...values) { params = values; return statement; },
      async first() {
        if (sql.includes("SELECT id, user_id, status, expires_at FROM licenses")) return license;
        if (sql.includes("SELECT max_devices FROM frezen_key_limits")) return { max_devices: maxDevices };
        if (sql.includes("SELECT id, owner_id, license_id, status, first_seen")) return bindings.get(`${params[0]}:${params[1]}`) ?? null;
        if (sql.includes("SELECT COUNT(*) AS total FROM hwid_bindings_v2")) {
          const active = [...bindings.values()].filter((row) => row.license_id === params[0] && row.status === "active").length;
          return { total: active };
        }
        if (sql.includes("SELECT id FROM hwid_bindings_v2 WHERE id = ?1 AND owner_id = ?2")) {
          return [...bindings.values()].find((row) => row.id === params[0] && row.owner_id === params[1]) ?? null;
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() {
        if (sql.includes("INSERT INTO hwid_bindings_v2")) {
          const row = { id: params[0], owner_id: params[1], license_id: params[2], hwid_hash: params[3], status: "active" };
          bindings.set(`${params[2]}:${params[3]}`, row);
          inserts += 1;
        }
        if (sql.includes("UPDATE hwid_bindings_v2 SET status")) {
          const row = [...bindings.values()].find((item) => item.id === params[3] && item.owner_id === params[4]);
          if (row) { row.status = params[0]; row.blocked_at = params[1]; row.blocked_reason = params[2]; }
        }
        if (sql.includes("UPDATE hwid_bindings_v2 SET status = 'blocked'")) {
          for (const row of bindings.values()) {
            if (row.owner_id === params[1] && row.license_id === params[2] && row.status === "active") {
              row.status = "blocked";
              row.blocked_at = params[0];
              row.blocked_reason = "HWID_RESET";
            }
          }
        }
        if (sql.includes("UPDATE hwid_bindings_v2 SET last_seen")) {
          const row = [...bindings.values()].find((item) => item.id === params[0]);
          if (row) row.last_seen = new Date().toISOString();
        }
        if (sql.includes("DELETE FROM hwid_bindings_v2")) {
          for (const [key, row] of bindings.entries()) {
            if (row.owner_id === params[0] && row.license_id === params[1] && row.status === "active") bindings.delete(key);
          }
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: inserts } };
      },
    };
    return statement;
  };

  return { prepare, bindings };
}

describe("HWID V2", () => {
  it("binds a first HWID without storing the raw value", async () => {
    const db = makeDb();
    const result = await bindHwidV2({ DB: db }, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-123" });
    expect(result.ok).toBe(true);
    expect(result.existing).toBe(false);
    expect(result.fingerprint).toHaveLength(12);
    const row = [...db.bindings.values()][0];
    expect(row.hwid_hash).not.toContain("DEVICE-123");
  });

  it("treats the same HWID as an existing binding", async () => {
    const db = makeDb();
    const first = await bindHwidV2({ DB: db }, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-123" });
    const second = await bindHwidV2({ DB: db }, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-123" });
    expect(first.deviceId).toBe(second.deviceId);
    expect(second.existing).toBe(true);
    expect(db.bindings.size).toBe(1);
  });

  it("enforces the per-key device limit", async () => {
    const db = makeDb({ maxDevices: 1 });
    await bindHwidV2({ DB: db }, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-A" });
    const result = await bindHwidV2({ DB: db }, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-B" });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("DEVICE_LIMIT_REACHED");
  });

  it("rejects a blocked HWID", async () => {
    const db = makeDb();
    const first = await bindHwidV2({ DB: db }, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-123" });
    const blocked = await setHwidStatusV2({ DB: db }, { ownerId: "owner-1", deviceId: first.deviceId, status: "blocked" });
    expect(blocked.ok).toBe(true);
    const validation = await validateHwidV2({ DB: db }, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-123" });
    expect(validation.ok).toBe(false);
    expect(validation.reason).toBe("HWID_BLOCKED");
  });

  it("rejects expired licenses before binding", async () => {
    const db = makeDb({ license: { id: "lic-1", user_id: "owner-1", status: "active", expires_at: "2000-01-01T00:00:00.000Z" } });
    const result = await bindHwidV2({ DB: db }, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-123" });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("LICENSE_EXPIRED");
  });

  it("reset removes active bindings only for the selected owner and license", async () => {
    const db = makeDb();
    const bound = await bindHwidV2({ DB: db }, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-123" });
    const result = await resetHwidV2({ DB: db }, { ownerId: "owner-1", licenseId: "lic-1" });
    expect(result.ok).toBe(true);
    const validation = await validateHwidV2({ DB: db }, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-123" });
    expect(validation.ok).toBe(false);
    expect(validation.reason).toBe("HWID_MISMATCH");
    const rebound = await bindHwidV2({ DB: db }, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-123" });
    expect(rebound.ok).toBe(true);
    expect(rebound.deviceId).not.toBe(bound.deviceId);
  });
});
