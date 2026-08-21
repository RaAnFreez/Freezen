import { describe, expect, it } from "vitest";
import { deliverScriptByKey } from "../src/script-loader.js";

const db = {
  prepare(sql) {
    return {
      bind(...args) {
        return {
          async first() {
            if (sql.includes("JOIN frezen_key_records") && !sql.includes("hwid_bindings_v2")) {
              return {
                script_id: args[1] ?? "s1",
                script_status: "ACTIVE",
                version: "v1.0.0",
                version_status: "ARCHIVED",
                content: "print('ok')",
                content_type: "text/x-lua",
                license_id: "lic-1",
                license_user_id: "owner-1",
                key_record_id: "key-1",
              };
            }
            if (sql.includes("FROM licenses l") && sql.includes("frezen_key_records kr")) {
              return { id: "lic-1", user_id: "owner-1", key_owner_id: "owner-1", status: "active", expires_at: null };
            }
            if (sql.includes("COUNT(*)") && sql.includes("hwid_bindings_v2")) return { total: 0 };
            return null;
          },
          async run() {
            return { meta: { changes: 1 } };
          },
        };
      },
    };
  },
};

describe("Script loader key access", () => {
  it("denies browser navigation", async () => {
    const response = await deliverScriptByKey(
      new Request("https://frezen.test/loader/s1", { headers: { accept: "text/html" } }),
      { DB: db },
      "req-browser",
      "s1",
    );
    expect(response.status).toBe(403);
  });

  it("allows a valid key to receive a newly created script version with a runtime identifier", async () => {
    const response = await deliverScriptByKey(
      new Request("https://frezen.test/loader/s1?key=FREZEN-TEST&hwid=CI-TEST-DEVICE", { headers: { accept: "text/plain" } }),
      { DB: db },
      "req-key",
      "s1",
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("print('ok')");
  });
});
