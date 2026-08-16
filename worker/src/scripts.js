const MAX_LUA_BYTES = 512 * 1024;
const VERSION_RE = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const bad = (json, requestId, error, status = 400, details) => json({ error, ...(details ? { details } : {}), request_id: requestId }, status, requestId);
const id = () => crypto.randomUUID();

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanName(name) {
  const value = String(name ?? "").trim();
  if (!value || value.length > 120 || /[\\/\0]/.test(value) || !value.toLowerCase().endsWith(".lua")) return null;
  return value;
}

function cleanVersion(value) {
  const version = String(value ?? "").trim();
  return VERSION_RE.test(version) ? (version.startsWith("v") ? version : `v${version}`) : null;
}

function cleanText(value, max) {
  const text = String(value ?? "").trim();
  return text.length <= max ? text : null;
}

async function audit(env, auth, action, resourceType, resourceId, status, requestId, metadata = {}) {
  if (!env.DB) return;
  try {
    await env.DB.prepare("INSERT INTO audit_logs (id,user_id,action,resource_type,resource_id,status,request_id,metadata_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)")
      .bind(id(), auth?.user_id ?? null, action, resourceType, resourceId ?? null, status, requestId, JSON.stringify(metadata)).run();
  } catch { /* audit failure must not expose database details to clients */ }
}

async function scriptSchemaStatus(env) {
  if (!env.DB) return { available: false, reason: "DATABASE_UNAVAILABLE", tables: [] };
  const result = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('scripts','script_versions','script_files') ORDER BY name").all();
  const tables = (result?.results ?? []).map((row) => String(row.name));
  const required = ["scripts", "script_versions", "script_files"];
  const available = required.every((table) => tables.includes(table));
  return { available, reason: available ? null : "SCRIPT_SCHEMA_UNAVAILABLE", tables };
}

async function parseUpload(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) return { error: "MULTIPART_FORM_DATA_REQUIRED" };
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "LUA_FILE_REQUIRED" };
  const fileName = cleanName(file.name);
  if (!fileName) return { error: "INVALID_LUA_FILENAME" };
  if (file.size <= 0 || file.size > MAX_LUA_BYTES) return { error: "LUA_FILE_TOO_LARGE_OR_EMPTY" };
  const content = await file.text();
  if (new TextEncoder().encode(content).byteLength > MAX_LUA_BYTES) return { error: "LUA_FILE_TOO_LARGE" };
  return { fileName, content, sizeBytes: file.size, version: cleanVersion(form.get("version")), releaseNotes: cleanText(form.get("release_notes"), 2000) ?? null };
}

export async function listScripts(request, env, requestId, json) {
  if (new URL(request.url).searchParams.get("health") === "1") {
    try { return json({ script_system: await scriptSchemaStatus(env), request_id: requestId }); }
    catch { return bad(json, requestId, "DATABASE_ERROR", 503); }
  }
  if (!env.DB) return bad(json, requestId, "DATABASE_UNAVAILABLE", 503);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim().toUpperCase();
  const productId = (url.searchParams.get("product_id") ?? "").trim();
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("page_size") ?? "20");
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return bad(json, requestId, "INVALID_PAGINATION");
  if (status && !["ACTIVE", "DISABLED"].includes(status)) return bad(json, requestId, "INVALID_SCRIPT_STATUS");
  if (q.length > 100 || productId.length > 128) return bad(json, requestId, "INVALID_SCRIPT_FILTER");
  const where = [];
  const bindings = [];
  if (status) { where.push("s.status = ?"); bindings.push(status); }
  if (productId) { where.push("s.product_id = ?"); bindings.push(productId); }
  if (q) { where.push("(s.id LIKE ? OR s.name LIKE ? OR s.description LIKE ? OR s.product_id LIKE ?)"); const pattern = `%${q}%`; bindings.push(pattern, pattern, pattern, pattern); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS total FROM scripts s ${clause}`).bind(...bindings).first();
  const total = Number(totalRow?.total ?? 0);
  const offset = (page - 1) * pageSize;
  const rows = await env.DB.prepare(`SELECT s.id,s.product_id,s.name,s.description,s.status,s.created_at,s.updated_at,p.name AS product_name,(SELECT COUNT(*) FROM script_versions sv WHERE sv.script_id=s.id) AS version_count,(SELECT sv.version FROM script_versions sv WHERE sv.script_id=s.id AND sv.status='ACTIVE' LIMIT 1) AS active_version FROM scripts s JOIN products p ON p.id=s.product_id ${clause} ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`).bind(...bindings, pageSize, offset).all();
  return json({ scripts: rows.results ?? [], pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) }, request_id: requestId });
}

export async function createScript(request, env, requestId, json, auth) {
  if (!env.DB) return bad(json, requestId, "DATABASE_UNAVAILABLE", 503);
  const schema = await scriptSchemaStatus(env).catch(() => ({ available: false }));
  if (!schema.available) return bad(json, requestId, "SCRIPT_SCHEMA_UNAVAILABLE", 503, { available_tables: schema.tables ?? [] });
  let body;
  try { body = await request.json(); } catch { return bad(json, requestId, "INVALID_JSON"); }
  const productId = String(body?.product_id ?? "").trim();
  const name = cleanText(body?.name, 120);
  const description = cleanText(body?.description, 1000) ?? null;
  if (!productId || !name) return bad(json, requestId, "PRODUCT_ID_AND_NAME_REQUIRED");
  try {
    const product = await env.DB.prepare("SELECT id,status FROM products WHERE id=?1 LIMIT 1").bind(productId).first();
    if (!product) return bad(json, requestId, "PRODUCT_NOT_FOUND", 404);
    if (product.status !== "ACTIVE") return bad(json, requestId, "PRODUCT_DISABLED", 409);
    const scriptId = id();
    await env.DB.prepare("INSERT INTO scripts (id,product_id,name,description,status) VALUES (?1,?2,?3,?4,'ACTIVE')").bind(scriptId, productId, name, description).run();
    await audit(env, auth, "SCRIPT_CREATED", "script", scriptId, "SUCCESS", requestId);
    return json({ script: { id: scriptId, product_id: productId, name, description, status: "ACTIVE" }, request_id: requestId }, 201, requestId);
  } catch (error) {
    if (String(error?.message ?? "").includes("UNIQUE")) return bad(json, requestId, "SCRIPT_ALREADY_EXISTS", 409);
    return bad(json, requestId, "DATABASE_ERROR", 503);
  }
}

export async function uploadScriptVersion(request, env, requestId, json, auth, scriptId) {
  if (!env.DB) return bad(json, requestId, "DATABASE_UNAVAILABLE", 503);
  const schema = await scriptSchemaStatus(env).catch(() => ({ available: false }));
  if (!schema.available) return bad(json, requestId, "SCRIPT_SCHEMA_UNAVAILABLE", 503, { available_tables: schema.tables ?? [] });
  const parsed = await parseUpload(request);
  if (parsed.error) return bad(json, requestId, parsed.error);
  if (!parsed.version) return bad(json, requestId, "INVALID_VERSION");
  const script = await env.DB.prepare("SELECT id,status FROM scripts WHERE id=?1 LIMIT 1").bind(scriptId).first();
  if (!script) return bad(json, requestId, "SCRIPT_NOT_FOUND", 404);
  if (script.status !== "ACTIVE") return bad(json, requestId, "SCRIPT_DISABLED", 409);
  const versionId = id();
  const fileId = id();
  const sha256 = await sha256Hex(parsed.content);
  try {
    await env.DB.prepare("INSERT INTO script_versions (id,script_id,version,file_reference,release_notes,status) VALUES (?1,?2,?3,?4,?5,'ARCHIVED')").bind(versionId, scriptId, parsed.version, fileId, parsed.releaseNotes).run();
    await env.DB.prepare("INSERT INTO script_files (id,script_version_id,file_name,content_type,size_bytes,content,sha256) VALUES (?1,?2,?3,'text/x-lua',?4,?5,?6)").bind(fileId, versionId, parsed.fileName, parsed.sizeBytes, parsed.content, sha256).run();
    await audit(env, auth, "SCRIPT_VERSION_UPLOADED", "script_version", versionId, "SUCCESS", requestId, { script_id: scriptId, version: parsed.version });
    return json({ version: { id: versionId, script_id: scriptId, version: parsed.version, file_name: parsed.fileName, size_bytes: parsed.sizeBytes, sha256, release_notes: parsed.releaseNotes, status: "ARCHIVED" }, request_id: requestId }, 201, requestId);
  } catch (error) {
    if (String(error?.message ?? "").includes("UNIQUE")) return bad(json, requestId, "VERSION_ALREADY_EXISTS", 409);
    return bad(json, requestId, "DATABASE_ERROR", 503);
  }
}

export async function setScriptVersionActive(request, env, requestId, json, auth, scriptId, versionId) {
  if (!env.DB) return bad(json, requestId, "DATABASE_UNAVAILABLE", 503);
  const schema = await scriptSchemaStatus(env).catch(() => ({ available: false }));
  if (!schema.available) return bad(json, requestId, "SCRIPT_SCHEMA_UNAVAILABLE", 503, { available_tables: schema.tables ?? [] });
  const version = await env.DB.prepare("SELECT id,script_id,version,status FROM script_versions WHERE id=?1 AND script_id=?2 LIMIT 1").bind(versionId, scriptId).first();
  if (!version) return bad(json, requestId, "SCRIPT_VERSION_NOT_FOUND", 404);
  if (version.status === "DISABLED") return bad(json, requestId, "SCRIPT_VERSION_DISABLED", 409);
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE script_versions SET status='ARCHIVED' WHERE script_id=?1 AND status='ACTIVE'").bind(scriptId),
      env.DB.prepare("UPDATE script_versions SET status='ACTIVE' WHERE id=?1 AND script_id=?2").bind(versionId, scriptId),
      env.DB.prepare("UPDATE scripts SET updated_at=CURRENT_TIMESTAMP WHERE id=?1").bind(scriptId),
    ]);
    await audit(env, auth, "SCRIPT_VERSION_ACTIVATED", "script_version", versionId, "SUCCESS", requestId, { script_id: scriptId, version: version.version });
    return json({ status: "active", version: { id: version.id, version: version.version }, request_id: requestId });
  } catch { return bad(json, requestId, "DATABASE_ERROR", 503); }
}

export async function setScriptVersionDisabled(request, env, requestId, json, auth, scriptId, versionId) {
  if (!env.DB) return bad(json, requestId, "DATABASE_UNAVAILABLE", 503);
  const schema = await scriptSchemaStatus(env).catch(() => ({ available: false }));
  if (!schema.available) return bad(json, requestId, "SCRIPT_SCHEMA_UNAVAILABLE", 503, { available_tables: schema.tables ?? [] });
  const version = await env.DB.prepare("SELECT id,script_id,version,status FROM script_versions WHERE id=?1 AND script_id=?2 LIMIT 1").bind(versionId, scriptId).first();
  if (!version) return bad(json, requestId, "SCRIPT_VERSION_NOT_FOUND", 404);
  if (version.status === "ACTIVE") return bad(json, requestId, "ACTIVE_VERSION_MUST_BE_ARCHIVED_OR_REPLACED", 409);
  if (version.status === "DISABLED") return json({ status: "disabled", version: { id: version.id, version: version.version }, request_id: requestId });
  const result = await env.DB.prepare("UPDATE script_versions SET status='DISABLED' WHERE id=?1 AND script_id=?2 AND status='ARCHIVED'").bind(versionId, scriptId).run();
  if (!result?.meta?.changes) return bad(json, requestId, "VERSION_UPDATE_FAILED", 503);
  await audit(env, auth, "SCRIPT_VERSION_DISABLED", "script_version", versionId, "SUCCESS", requestId, { script_id: scriptId, version: version.version });
  return json({ status: "disabled", version: { id: version.id, version: version.version }, request_id: requestId });
}

export async function updateScript(request, env, requestId, json, auth, scriptId) {
  if (!env.DB) return bad(json, requestId, "DATABASE_UNAVAILABLE", 503);
  const schema = await scriptSchemaStatus(env).catch(() => ({ available: false }));
  if (!schema.available) return bad(json, requestId, "SCRIPT_SCHEMA_UNAVAILABLE", 503, { available_tables: schema.tables ?? [] });
  let body;
  try { body = await request.json(); } catch { return bad(json, requestId, "INVALID_JSON"); }
  if (!["ACTIVE", "DISABLED"].includes(body?.status)) return bad(json, requestId, "INVALID_SCRIPT_STATUS");
  const result = await env.DB.prepare("UPDATE scripts SET status=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2").bind(body.status, scriptId).run();
  if (!result?.meta?.changes) return bad(json, requestId, "SCRIPT_NOT_FOUND", 404);
  await audit(env, auth, "SCRIPT_STATUS_CHANGED", "script", scriptId, "SUCCESS", requestId, { status: body.status });
  return json({ status: body.status, request_id: requestId });
}

export async function deleteScript(request, env, requestId, json, auth, scriptId) {
  if (!env.DB) return bad(json, requestId, "DATABASE_UNAVAILABLE", 503);
  const schema = await scriptSchemaStatus(env).catch(() => ({ available: false }));
  if (!schema.available) return bad(json, requestId, "SCRIPT_SCHEMA_UNAVAILABLE", 503, { available_tables: schema.tables ?? [] });
  const result = await env.DB.prepare("DELETE FROM scripts WHERE id=?1").bind(scriptId).run();
  if (!result?.meta?.changes) return bad(json, requestId, "SCRIPT_NOT_FOUND", 404);
  await audit(env, auth, "SCRIPT_DELETED", "script", scriptId, "SUCCESS", requestId);
  return json({ status: "deleted", request_id: requestId });
}

export async function getScript(request, env, requestId, json, scriptId) {
  if (!env.DB) return bad(json, requestId, "DATABASE_UNAVAILABLE", 503);
  const schema = await scriptSchemaStatus(env).catch(() => ({ available: false }));
  if (!schema.available) return bad(json, requestId, "SCRIPT_SCHEMA_UNAVAILABLE", 503, { available_tables: schema.tables ?? [] });
  const script = await env.DB.prepare("SELECT s.id,s.product_id,s.name,s.description,s.status,s.created_at,s.updated_at,p.name AS product_name FROM scripts s JOIN products p ON p.id=s.product_id WHERE s.id=?1 LIMIT 1").bind(scriptId).first();
  if (!script) return bad(json, requestId, "SCRIPT_NOT_FOUND", 404);
  const versions = await env.DB.prepare("SELECT id,version,file_reference,release_notes,status,created_at FROM script_versions WHERE script_id=?1 ORDER BY created_at DESC").bind(scriptId).all();
  return json({ script, versions: versions.results ?? [], request_id: requestId });
}
