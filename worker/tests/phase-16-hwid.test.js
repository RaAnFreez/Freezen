import { describe, expect, it } from "vitest";
import { bindHwidV2, validateHwidV2, resetHwidV2, setHwidStatusV2 } from "../src/security/hwid-v2.js";

const hash = async (value) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

function dbFactory({ license, bindings = [], maxDevices = 2 }) {
  const rows = bindings.map((row) => ({ ...row }));
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("FROM licenses")) return license;
              if (sql.includes("FROM frezen_key_limits")) return { max_devices: maxDevices };
              if (sql.includes("FROM hwid_bindings_v2") && sql.includes("hwid_hash")) {
                return rows.find((row) => row.license_id === values[0] && row.hwid_hash === values[1]) ?? null;
              }
              if (sql.includes("COUNT(*)") && sql.includes("hwid_bindings_v2")) {
                return { total: rows.filter((row) => row.license_id === values[0] && row.status === "active").length };
              }
              if (sql.includes("FROM hwid_bindings_v2") && sql.includes("owner_id")) {
                return rows.find((row) => row.id === values[0] && row.owner_id === values[1]) ?? null;
              }
              return null;
            },
            async all() {
              return { results: rows.filter((row) => row.owner_id === values[0] && (!values[1] || row.license_id === values[1])) };
            },
            async run() {
              if (sql.startsWith("INSERT INTO hwid_bindings_v2")) {
                rows.push({ id: values[0], owner_id: values[1], license_id: values[2], hwid_hash: values[3], status: "active" });
              }
              if (sql.startsWith("UPDATE hwid_bindings_v2 SET status")) {
                const row = rows.find((item) => item.id === values[3] && item.owner_id === values[4]);
                if (row) row.status = values[0];
              }
              if (sql.startsWith("UPDATE hwid_bindings_v2 SET last_seen")) {
                const row = rows.find((item) => item.id === values[0]);
                if (row) row.last_seen = new Date().toISOString();
              }
              if (sql.startsWith("UPDATE hwid_bindings_v2 SET status = 'blocked'")) {
                rows.filter((row) => row.owner_id === values[1] && row.license_id === values[2] && row.status === "active").forEach((row) => { row.status = "blocked"; });
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

const license = { id: "l1", user_id: "u1", status: "active", expires_at: null };

describe("Phase 16 HWID compatibility", () => {
  it("binds a device and stores only a hash", async () => {
    const db = dbFactory({ license });
    const result = await bindHwidV2(dbEnv(db), { licenseId: "l1", ownerId: "u1", rawHwid: "device-secret-1" });
    expect(result.ok).toBe(true);
    expect(result.existing).toBe(false);
    expect(result.fingerprint).toBe((await hash("device-secret-1")).slice(0, 12));
    expect(result.rawHwid).toBeUndefined();
  });

  it("rejects a third active device when max_devices is reached", async () => {
    const db = dbFactory({ license, maxDevices: 1, bindings: [{ id: "d1", owner_id: "u1", license_id: "l1", hwid_hash: await hash("device-1"), status: "active" }] });
    const result = await bindHwidV2(dbEnv(db), { licenseId: "l1", ownerId: "u1", rawHwid: "device-2" });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("DEVICE_LIMIT_REACHED");
  });

  it("validates matching HWID and denies mismatch", async () => {
    const db = dbFactory({ license, bindings: [{ id: "d1", owner_id: "u1", license_id: "l1", hwid_hash: await hash("device-1"), status: "active" }] });
    const valid = await validateHwidV2(dbEnv(db), { licenseId: "l1", ownerId: "u1", rawHwid: "device-1" });
    expect(valid.ok).toBe(true);
    const invalid = await validateHwidV2(dbEnv(db), { licenseId: "l1", ownerId: "u1", rawHwid: "wrong-device" });
    expect(invalid.ok).toBe(false);
    expect(invalid.reason).toBe("HWID_MISMATCH");
  });

  it("blocks and unblocks a device", async () => {
    const db = dbFactory({ license, bindings: [{ id: "d1", owner_id: "u1", license_id: "l1", hwid_hash: await hash("device-1"), status: "active" }] });
    const blocked = await setHwidStatusV2(dbEnv(db), { ownerId: "u1", deviceId: "d1", status: "blocked" });
    expect(blocked.ok).toBe(true);
    expect(blocked.status).toBe("blocked");
    const unblocked = await setHwidStatusV2(dbEnv(db), { ownerId: "u1", deviceId: "d1", status: "active" });
    expect(unblocked.ok).toBe(true);
    expect(unblocked.status).toBe("active");
  });

  it("resets active bindings for the owner license", async () => {
    const db = dbFactory({ license, bindings: [{ id: "d1", owner_id: "u1", license_id: "l1", hwid_hash: await hash("device-1"), status: "active" }] });
    const result = await resetHwidV2(dbEnv(db), { ownerId: "u1", licenseId: "l1" });
    expect(result.ok).toBe(true);
    expect(result.resetAt).toBeTruthy();
  });
});

function dbEnv(db) {
  return { DB: db };
}
