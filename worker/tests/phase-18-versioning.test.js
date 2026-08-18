import { describe, expect, it } from "vitest";
import { setScriptVersionActive } from "../src/scripts.js";

const auth = { user_id: "owner-1", role: "OWNER" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function dbMock(versions) {
  const state = versions.map((version) => ({ ...version }));
  const statement = (sql, values) => ({
    first: async () => {
      if (sql.includes("JOIN frezen_key_services")) {
        return values[0] === "s1" && values[1] === "owner-1" ? { id: "s1" } : null;
      }
      return state.find((v) => v.id === values[0] && v.script_id === values[1]) ?? null;
    },
    run: async () => {
      if (sql.includes("SET status='ARCHIVED'")) {
        state.filter((v) => v.script_id === values[0] && v.status === "ACTIVE").forEach((v) => { v.status = "ARCHIVED"; });
      }
      if (sql.includes("SET status='ACTIVE'")) {
        const v = state.find((row) => row.id === values[0] && row.script_id === values[1]);
        if (v) v.status = "ACTIVE";
      }
      return { meta: { changes: 1 } };
    },
  });
  return {
    state,
    prepare(sql) { return { bind: (...values) => statement(sql, values) }; },
    batch(statements) { return Promise.all(statements.map((s) => s.run())); },
  };
}

describe("Phase 18 — Script Versioning", () => {
  it("activates a version and archives the previous active version", async () => {
    const db = dbMock([
      { id: "v1", script_id: "s1", version: "v1.0.0", status: "ACTIVE" },
      { id: "v2", script_id: "s1", version: "v1.1.0", status: "ARCHIVED" },
    ]);
    const response = await setScriptVersionActive(new Request("https://frezen.test", { method: "PATCH" }), { DB: db }, "req-1", json, auth, "s1", "v2");
    expect(response.status).toBe(200);
    expect(db.state.find((v) => v.id === "v1").status).toBe("ARCHIVED");
    expect(db.state.find((v) => v.id === "v2").status).toBe("ACTIVE");
  });

  it("rejects activation of a disabled version", async () => {
    const db = dbMock([{ id: "v2", script_id: "s1", version: "v1.1.0", status: "DISABLED" }]);
    const response = await setScriptVersionActive(new Request("https://frezen.test", { method: "PATCH" }), { DB: db }, "req-2", json, auth, "s1", "v2");
    expect(response.status).toBe(409);
    expect(db.state[0].status).toBe("DISABLED");
  });

  it("rejects access when the script is not owned by the authenticated user", async () => {
    const db = dbMock([{ id: "v1", script_id: "s1", version: "v1.0.0", status: "ARCHIVED" }]);
    const response = await setScriptVersionActive(new Request("https://frezen.test", { method: "PATCH" }), { DB: db }, "req-3", json, { ...auth, user_id: "another-owner" }, "s1", "v1");
    expect(response.status).toBe(404);
    expect(db.state[0].status).toBe("ARCHIVED");
  });

  it("rejects a version that belongs to another script", async () => {
    const db = dbMock([{ id: "v1", script_id: "other-script", version: "v1.0.0", status: "ARCHIVED" }]);
    const response = await setScriptVersionActive(new Request("https://frezen.test", { method: "PATCH" }), { DB: db }, "req-4", json, auth, "s1", "v1");
    expect(response.status).toBe(404);
  });
});
