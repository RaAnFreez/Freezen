import { describe, expect, it } from "vitest";
import { createScript, listScripts, uploadScriptVersion, setScriptVersionActive } from "../src/scripts.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const auth = { user_id: "owner-1", role: "OWNER" };

function dbMock({ services = [], scripts = [], versions = [], files = [] } = {}) {
  const state = { services: [...services], scripts: [...scripts], versions: [...versions], files: [...files] };
  const make = (sql, values) => ({
    first: async () => {
      if (sql.includes("FROM frezen_key_services WHERE id=?1")) return state.services.find((row) => row.id === values[0] && row.owner_id === values[1]) ?? null;
      if (sql.includes("FROM scripts WHERE id")) return state.scripts.find((row) => row.id === values[0]) ?? null;
      if (sql.includes("FROM script_versions WHERE id")) return state.versions.find((row) => row.id === values[0] && row.script_id === values[1]) ?? null;
      if (sql.includes("COUNT(*) AS total FROM scripts")) return { total: state.scripts.length };
      if (sql.includes("JOIN frezen_key_services sv")) return state.scripts.find((row) => row.id === values[0]) ? { id: values[0] } : null;
      return null;
    },
    all: async () => {
      if (sql.includes("SELECT id,name,slug,active FROM frezen_key_services")) return { results: state.services };
      return { results: state.scripts.map((script) => ({ ...script, service_name: state.services.find((s) => s.id === script.service_id)?.name || null, service_slug: state.services.find((s) => s.id === script.service_id)?.slug || null, version_count: state.versions.filter((v) => v.script_id === script.id).length, active_version: state.versions.find((v) => v.script_id === script.id && v.status === "ACTIVE")?.version ?? null })) };
    },
    run: async () => {
      if (sql.includes("INSERT INTO scripts")) state.scripts.push({ id: values[0], service_id: values[1], name: values[2], description: values[3], loader_url: values[4], status: "ACTIVE" });
      if (sql.includes("INSERT INTO script_versions")) state.versions.push({ id: values[0], script_id: values[1], version: values[2], file_reference: values[3], release_notes: values[4], status: "ARCHIVED" });
      if (sql.includes("INSERT INTO script_files")) state.files.push({ id: values[0], script_version_id: values[1], file_name: values[2], content: values[4], sha256: values[5] });
      if (sql.includes("UPDATE script_versions SET status='ARCHIVED'")) state.versions.filter((v) => v.script_id === values[0] && v.status === "ACTIVE").forEach((v) => { v.status = "ARCHIVED"; });
      if (sql.includes("UPDATE script_versions SET status='ACTIVE'")) { const row = state.versions.find((v) => v.id === values[0] && v.script_id === values[1]); if (row) row.status = "ACTIVE"; }
      return { meta: { changes: 1 } };
    },
  });
  return { state, prepare(sql) { return { bind: (...values) => make(sql, values), first: () => make(sql, []).first(), all: () => make(sql, []).all(), run: () => make(sql, []).run() }; }, batch(statements) { return Promise.all(statements.map((statement) => statement.run())); } };
}

describe("Phase 17 Lua Script Manager", () => {
  it("creates a script only for an active Service", async () => {
    const db = dbMock({ services: [{ id: "s1", owner_id: "owner-1", name: "Frezen", slug: "frezen", active: 1 }] });
    const request = new Request("https://frezen.test", { method: "POST", body: JSON.stringify({ service_id: "s1", name: "Frezen Script", description: "test" }), headers: { "content-type": "application/json" } });
    const response = await createScript(request, { DB: db }, "phase17-create", json, auth);
    expect(response.status).toBe(201);
    expect(db.state.scripts[0].service_id).toBe("s1");
  });

  it("rejects non-Lua files and invalid versions", async () => {
    const db = dbMock({ scripts: [{ id: "s1", service_id: "svc", status: "ACTIVE" }] });
    const form = new FormData();
    form.append("file", new File(["print('x')"], "script.txt", { type: "text/plain" }));
    form.append("version", "1.0.0");
    let response = await uploadScriptVersion(new Request("https://frezen.test", { method: "POST", body: form }), { DB: db }, "phase17-upload", json, auth, "s1");
    expect(response.status).toBe(400);

    const validForm = new FormData();
    validForm.append("file", new File(["print('x')"], "script.lua", { type: "text/x-lua" }));
    validForm.append("version", "bad");
    response = await uploadScriptVersion(new Request("https://frezen.test", { method: "POST", body: validForm }), { DB: db }, "phase17-upload", json, auth, "s1");
    expect(response.status).toBe(400);
  });

  it("stores Lua as data and keeps uploaded versions archived until activation", async () => {
    const db = dbMock({ scripts: [{ id: "s1", service_id: "svc", status: "ACTIVE" }], services: [{ id: "svc", owner_id: "owner-1", name: "Frezen", slug: "frezen", active: 1 }] });
    const form = new FormData();
    form.append("file", new File(["script_key=\"PASTE YOUR KEY HERE\";\nprint('safe')"], "safe.lua", { type: "text/x-lua" }));
    form.append("version", "1.0.0");
    form.append("release_notes", "Initial release");
    const response = await uploadScriptVersion(new Request("https://frezen.test", { method: "POST", body: form }), { DB: db }, "phase17-upload", json, auth, "s1");
    expect(response.status).toBe(201);
    expect(db.state.files[0].content).toContain("PASTE YOUR KEY HERE");
    expect(db.state.versions[0].status).toBe("ARCHIVED");
  });

  it("activates exactly the requested version", async () => {
    const db = dbMock({ scripts: [{ id: "s1", service_id: "svc", status: "ACTIVE" }], services: [{ id: "svc", owner_id: "owner-1", name: "Frezen", slug: "frezen", active: 1 }], versions: [{ id: "v1", script_id: "s1", version: "v1.0.0", status: "ACTIVE" }, { id: "v2", script_id: "s1", version: "v1.1.0", status: "ARCHIVED" }] });
    const response = await setScriptVersionActive(new Request("https://frezen.test", { method: "PATCH" }), { DB: db }, "phase17-active", json, auth, "s1", "v2");
    expect(response.status).toBe(200);
    expect(db.state.versions.find((v) => v.id === "v1").status).toBe("ARCHIVED");
    expect(db.state.versions.find((v) => v.id === "v2").status).toBe("ACTIVE");
  });

  it("lists scripts with Service metadata", async () => {
    const db = dbMock({ services: [{ id: "svc", owner_id: "owner-1", name: "Frezen", slug: "frezen", active: 1 }], scripts: [{ id: "s1", service_id: "svc", name: "One", status: "ACTIVE" }, { id: "s2", service_id: "svc", name: "Two", status: "DISABLED" }] });
    const response = await listScripts(new Request("https://frezen.test/api/v1/scripts?page=1&page_size=20"), { DB: db }, "phase17-list", json);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.pagination.total).toBe(2);
    expect(data.scripts[0].service_name).toBe("Frezen");
  });
});
