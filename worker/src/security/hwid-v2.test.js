import { describe, expect, it } from "vitest";
import { bindHwidV2 } from "./hwid-v2.js";

function makeDb(maxDevices) {
  const bindings = [];
  const license = {
    id: "license-1",
    user_id: null,
    status: "active",
    expires_at: null,
    max_devices: maxDevices,
    key_owner_id: null,
  };

  const DB = {
    bindings,
    async batch() { return []; },
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM licenses l") && sql.includes("COALESCE(kl.max_devices")) return { max_devices: maxDevices };
              if (sql.includes("FROM licenses l")) return license;
              if (sql.includes("FROM hwid_bindings_v2 WHERE owner_id") && sql.includes("status = 'blocked'")) return null;
              if (sql.includes("FROM hwid_bindings_v2 WHERE license_id") && sql.includes("hwid_hash =")) {
                return bindings.find((row) => row.license_id === args[0] && row.hwid_hash === args[1]) ?? null;
              }
              if (sql.includes("COUNT(*) AS total FROM hwid_bindings_v2")) {
                return { total: bindings.filter((row) => row.license_id === args[0] && row.status === "active").length };
              }
              return null;
            },
            async run() {
              if (sql.startsWith("INSERT INTO hwid_bindings_v2")) {
                bindings.push({
                  id: args[0],
                  owner_id: args[1],
                  license_id: args[2],
                  hwid_hash: args[3],
                  game_username: args[4],
                  game_user_id: args[5],
                  status: "active",
                });
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return DB;
}

describe("HWID v2 license device limits", () => {
  it("honors licenses.max_devices when no key-specific override exists", async () => {
    const DB = makeDb(2);
    const env = { DB };
    const first = await bindHwidV2(env, { licenseId: "license-1", rawHwid: "device-one" });
    const second = await bindHwidV2(env, { licenseId: "license-1", rawHwid: "device-two" });
    const third = await bindHwidV2(env, { licenseId: "license-1", rawHwid: "device-three" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third).toEqual({ ok: false, reason: "DEVICE_LIMIT_REACHED" });
    expect(DB.bindings).toHaveLength(2);
  });
});
