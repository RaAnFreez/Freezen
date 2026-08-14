import { apiKeyPrefix, createApiKeySecret, hashApiKey, isApiKeyUsable, normalizeApiKeyScopes, publicApiKey } from "./api-keys.js";

const MAX_NAME_LENGTH = 100;
const MAX_KEYS_PER_USER = 100;

function error(json, code, requestId, status = 400) {
  return json({ error: code, request_id: requestId }, status, requestId);
}

async function writeAudit(env, auth, requestId, action, resourceId, status, metadata = {}) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, status, request_id, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
    ).bind(
      crypto.randomUUID(),
      auth?.user_id ?? null,
      action,
      "api_key",
      resourceId ?? null,
      status,
      requestId,
      JSON.stringify(metadata),
    ).run();
  } catch {
    // Audit failures must not expose database details or break the primary action.
  }
}

function parseBody(request) {
  return request.json().catch(() => null);
}

function validateName(name) {
  return typeof name === "string" && name.trim().length > 0 && name.trim().length <= MAX_NAME_LENGTH;
}

function validateExpiry(expiresAt) {
  if (expiresAt == null || expiresAt === "") return null;
  if (typeof expiresAt !== "string") return false;
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp > Date.now() ? new Date(timestamp).toISOString() : false;
}

function rowToPublic(row) {
  return publicApiKey({
    ...row,
    scopes_json: row.scopes_json ?? "[]",
  });
}

export async function listApiKeys(request, env, requestId, json, auth) {
  if (!env.DB) return error(json, "DATABASE_UNAVAILABLE", requestId, 503);
  try {
    const result = await env.DB.prepare(
      "SELECT id, name, key_prefix, owner_user_id, scopes_json, expires_at, revoked_at, last_used_at, created_at, updated_at FROM api_keys WHERE owner_user_id = ?1 ORDER BY created_at DESC LIMIT ?2"
    ).bind(auth.user_id, MAX_KEYS_PER_USER).all();
    return json({ api_keys: (result?.results ?? []).map(rowToPublic), request_id: requestId }, 200, requestId);
  } catch {
    return error(json, "DATABASE_ERROR", requestId, 503);
  }
}

export async function createApiKey(request, env, requestId, json, auth) {
  if (!env.DB) return error(json, "DATABASE_UNAVAILABLE", requestId, 503);
  const body = await parseBody(request);
  if (!body || !validateName(body.name)) return error(json, "INVALID_API_KEY_NAME", requestId);
  const scopes = normalizeApiKeyScopes(body.scopes);
  if (!scopes.length) return error(json, "INVALID_API_KEY_SCOPES", requestId);
  const expiresAt = validateExpiry(body.expires_at);
  if (expiresAt === false) return error(json, "INVALID_API_KEY_EXPIRATION", requestId);

  const secret = createApiKeySecret();
  const hash = await hashApiKey(secret);
  const id = crypto.randomUUID();
  const prefix = apiKeyPrefix(secret);

  try {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM api_keys WHERE owner_user_id = ?1 AND revoked_at IS NULL").bind(auth.user_id).first();
    if (Number(count?.count ?? 0) >= MAX_KEYS_PER_USER) return error(json, "API_KEY_LIMIT_REACHED", requestId, 409);

    await env.DB.prepare(
      "INSERT INTO api_keys (id, key_prefix, key_hash, name, owner_user_id, scopes_json, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    ).bind(id, prefix, hash, body.name.trim(), auth.user_id, JSON.stringify(scopes), expiresAt).run();

    await writeAudit(env, auth, requestId, "API_KEY_CREATED", id, "success", { name: body.name.trim(), scopes, expires_at: expiresAt });
    return json({ api_key: { id, name: body.name.trim(), key_prefix: prefix, scopes, expires_at: expiresAt }, secret, warning: "Store this API key now. The secret will not be returned again.", request_id: requestId }, 201, requestId);
  } catch {
    return error(json, "DATABASE_ERROR", requestId, 503);
  }
}

export async function revokeApiKey(request, env, requestId, json, auth, keyId) {
  if (!env.DB) return error(json, "DATABASE_UNAVAILABLE", requestId, 503);
  if (!keyId || keyId.length > 128) return error(json, "INVALID_API_KEY_ID", requestId);
  try {
    const row = await env.DB.prepare("SELECT id, revoked_at FROM api_keys WHERE id = ?1 AND owner_user_id = ?2 LIMIT 1").bind(keyId, auth.user_id).first();
    if (!row) return error(json, "API_KEY_NOT_FOUND", requestId, 404);
    if (row.revoked_at) return json({ revoked: true, already_revoked: true, request_id: requestId }, 200, requestId);
    await env.DB.prepare("UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?1 AND owner_user_id = ?2").bind(keyId, auth.user_id).run();
    await writeAudit(env, auth, requestId, "API_KEY_REVOKED", keyId, "success");
    return json({ revoked: true, request_id: requestId }, 200, requestId);
  } catch {
    return error(json, "DATABASE_ERROR", requestId, 503);
  }
}

export async function rotateApiKey(request, env, requestId, json, auth, keyId) {
  if (!env.DB) return error(json, "DATABASE_UNAVAILABLE", requestId, 503);
  if (!keyId || keyId.length > 128) return error(json, "INVALID_API_KEY_ID", requestId);
  try {
    const row = await env.DB.prepare("SELECT id, name, scopes_json, expires_at, revoked_at FROM api_keys WHERE id = ?1 AND owner_user_id = ?2 LIMIT 1").bind(keyId, auth.user_id).first();
    if (!row) return error(json, "API_KEY_NOT_FOUND", requestId, 404);
    if (!isApiKeyUsable(row)) return error(json, "API_KEY_NOT_USABLE", requestId, 409);

    const secret = createApiKeySecret();
    const hash = await hashApiKey(secret);
    const newId = crypto.randomUUID();
    const prefix = apiKeyPrefix(secret);
    const scopes = normalizeApiKeyScopes(JSON.parse(row.scopes_json || "[]"));

    await env.DB.batch([
      env.DB.prepare("UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?1 AND owner_user_id = ?2").bind(keyId, auth.user_id),
      env.DB.prepare("INSERT INTO api_keys (id, key_prefix, key_hash, name, owner_user_id, scopes_json, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(newId, prefix, hash, row.name, auth.user_id, JSON.stringify(scopes), row.expires_at),
    ]);

    await writeAudit(env, auth, requestId, "API_KEY_ROTATED", newId, "success", { revoked_key_id: keyId });
    return json({ api_key: { id: newId, name: row.name, key_prefix: prefix, scopes, expires_at: row.expires_at }, secret, warning: "Store this API key now. The secret will not be returned again.", request_id: requestId }, 201, requestId);
  } catch {
    return error(json, "DATABASE_ERROR", requestId, 503);
  }
}

export async function getApiKeyUsage(request, env, requestId, json, auth, keyId) {
  if (!env.DB) return error(json, "DATABASE_UNAVAILABLE", requestId, 503);
  try {
    const row = await env.DB.prepare("SELECT id, key_prefix, name, last_used_at, created_at, expires_at, revoked_at FROM api_keys WHERE id = ?1 AND owner_user_id = ?2 LIMIT 1").bind(keyId, auth.user_id).first();
    if (!row) return error(json, "API_KEY_NOT_FOUND", requestId, 404);
    return json({ usage: { id: row.id, key_prefix: row.key_prefix, name: row.name, last_used_at: row.last_used_at, created_at: row.created_at, expires_at: row.expires_at, revoked_at: row.revoked_at }, request_id: requestId }, 200, requestId);
  } catch {
    return error(json, "DATABASE_ERROR", requestId, 503);
  }
}
