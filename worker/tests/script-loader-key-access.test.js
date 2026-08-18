import { describe, expect, it } from "vitest";
import { deliverScriptByKey } from "../src/script-loader.js";

const db = {
  prepare(sql) {
    return {
      bind(...args) {
        return {
          async first() {
            if (sql.includes("FROM frezen_key_records")) {
              return {
                script_id: args[1],
                script_status: "ACTIVE",
                version: "v1.0.0",
                version_status: "ARCHIVED",
                content: "print('ok')",
                content_type: "text/x-lua",
              };
            }
            return null;
          },
        };
      },
    };
  },
};

describe("Script loader key access", () => {
  it("denies browser navigation", async () => {
    const request = new Request("https://frezen.test/loader/s1", { headers: { accept: "text/html" } });
    const response = await deliverScriptByKey(request, { DB: db }, "req-browser", "s1");
    expect(response.status).toBe(403);
  });

  it("allows a valid key to receive a newly created script version", async () => {
    const request = new Request("https://frezen.test/loader/s1?key=FREZEN-TEST", { headers: { accept: "text/plain" } });
    const response = await deliverScriptByKey(request, { DB: db }, "req-key", "s1");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("print('ok')");
  });
});
