const encoder = new TextEncoder();
const DEFAULT_RESET_COOLDOWN_SECONDS = 86400;
const MAX_HWID_LENGTH = 512;

const sha256Hex = async (value) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const normalizeHwid = (value) => typeof value === "string" ? value.trim() : "";
const normalizeLicenseId = (value) => typeof value === "string" ? value.trim() : "";
const now = () => new Date();
const isoNow = () => now().toISOString();
const parseCooldown = (env) => {
  const value = Number(env.HWID_RESET_COOLDOWN_SECONDS ?? DEFAULT_RESET_COOLDOWN_SECONDS);
  return Number.isInteger(value) && value >= 0 && value <= 2592000 ? value : DEFAULT_RESET_COOLDOWN_SECONDS;
};
const jsonError = (json, status, error, requestId, extra = {}) => json({ error, request_id: requestId, ...extra }, status, requestId);

async function readJson(request, json, requestId) {
  try { return await request.json(); } catch { return jsonError(json, 400, "INVALID_JSON", requestId); }
}

async function licenseFor(env, licenseId) {
  return env.DB.prepare(
    "SELECT id, user_id, status, expires_at, max_devices, hwid_reset_at, hwid_reset_cooldown_until FROM licenses WHERE id = ?1 LIMIT 1",
  ).bind(licenseId).first();
}

function licenseUsable(license) {
  if (!license) return "LICENSE_NOT_FOUND";
  const status = String(license.status ?? "").toLowerCase();
  if (["revoked", "banned"].includes(status)) return "LICENSE_BLOCKED";
  if (status === "expired") return "LICENSE_EXPIRED";
  if (license.expires_at) {
    const expiry = new Date(license.expires_at).getTime();
    if (!Number.isNaN(expiry) && expiry <= Date.now()) return "LICENSE_EXPIRED";
  }
  return null;
}

async function audit(env, licenseId, action, details = null) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO license_audit_log (id, license_id, previous_status, new_status) VALUES (?1, ?2, ?3, ?4)",
    ).bind(crypto.randomUUID(), licenseId, action, details).run();
  } catch {
    // Audit failures must not expose internal database details to clients.
  }
}

export async function listHwid(request, env, requestId, json) {
  if (!env.DB) return jsonError(json, 503, "DATABASE_UNAVAILABLE", requestId);
  const url = new URL(request.url);
  const licenseId = normalizeLicenseId(url.searchParams.get("license_id"));
  if (!licenseId || licenseId.length > 128) return jsonError(json, 400, "INVALID_LICENSE_ID", requestId);
  try {
    const rows = await env.DB.prepare(
      "SELECT id, license_id, user_id, status, first_seen, last_seen, blocked_at, blocked_reason, created_at, updated_at FROM devices WHERE license_id = ?1 ORDER BY created_at DESC",
    ).bind(licenseId).all();
    return json({ devices: rows.results ?? [], request_id: requestId });
  } catch {
    return jsonError(json, 503, "DATABASE_ERROR", requestId);
  }
}

export async function bindHwid(request, env, requestId, json, auth) {
  if (!env.DB || !auth?.user_id) return jsonError(json, 401, "SESSION_AUTH_REQUIRED", requestId);
  const body = await readJson(request, json, requestId);
  if (body instanceof Response) return body;
  const licenseId = normalizeLicenseId(body?.license_id);
  const rawHwid = normalizeHwid(body?.hwid);
  if (!licenseId || licenseId.length > 128) return jsonError(json, 400, "INVALID_LICENSE_ID", requestId);
  if (!rawHwid || rawHwid.length > MAX_HWID_LENGTH) return jsonError(json, 400, "INVALID_HWID", requestId);

  try {
    const license = await licenseFor(env, licenseId);
    const licenseError = licenseUsable(license);
    if (licenseError) return jsonError(json, licenseError === "LICENSE_NOT_FOUND" ? 404 : 403, licenseError, requestId);
    if (license.user_id !== auth.user_id) return jsonError(json, 403, "LICENSE_OWNERSHIP_REQUIRED", requestId);

    const hwidHash = await sha256Hex(rawHwid);
    const existing = await env.DB.prepare(
      "SELECT id, status FROM devices WHERE license_id = ?1 AND hwid_hash = ?2 LIMIT 1",
    ).bind(licenseId, hwidHash).first();
    if (existing) {
      if (existing.status === "blocked") return jsonError(json, 403, "HWID_BLOCKED", requestId);
      await env.DB.prepare("UPDATE devices SET last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(existing.id).run();
      return json({ bound: true, existing: true, device_id: existing.id, request_id: requestId });
    }

    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM devices WHERE license_id = ?1 AND status = 'active'").bind(licenseId).first();
    if (Number(count?.total ?? 0) >= Number(license.max_devices ?? 1)) return jsonError(json, 409, "DEVICE_LIMIT_REACHED", requestId);

    const deviceId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO devices (id, license_id, user_id, hwid_hash, status) VALUES (?1, ?2, ?3, ?4, 'active')",
    ).bind(deviceId, licenseId, auth.user_id, hwidHash).run();
    await env.DB.prepare("UPDATE licenses SET current_hwid = ?1, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?2").bind(hwidHash, licenseId).run();
    await audit(env, licenseId, "HWID_BOUND", "active");
    return json({ bound: true, existing: false, device_id: deviceId, request_id: requestId }, 201, requestId);
  } catch {
    return jsonError(json, 503, "DATABASE_ERROR", requestId);
  }
}

export async function validateHwid(request, env, requestId, json, auth) {
  if (!env.DB || !auth?.user_id) return jsonError(json, 401, "SESSION_AUTH_REQUIRED", requestId);
  const body = await readJson(request, json, requestId);
  if (body instanceof Response) return body;
  const licenseId = normalizeLicenseId(body?.license_id);
  const rawHwid = normalizeHwid(body?.hwid);
  if (!licenseId || licenseId.length > 128) return jsonError(json, 400, "INVALID_LICENSE_ID", requestId);
  if (!rawHwid || rawHwid.length > MAX_HWID_LENGTH) return jsonError(json, 400, "INVALID_HWID", requestId);
  try {
    const license = await licenseFor(env, licenseId);
    const licenseError = licenseUsable(license);
    if (licenseError) return jsonError(json, licenseError === "LICENSE_NOT_FOUND" ? 404 : 403, licenseError, requestId);
    if (license.user_id !== auth.user_id) return jsonError(json, 403, "LICENSE_OWNERSHIP_REQUIRED", requestId);
    const hwidHash = await sha256Hex(rawHwid);
    const device = await env.DB.prepare("SELECT id, status FROM devices WHERE license_id = ?1 AND hwid_hash = ?2 LIMIT 1").bind(licenseId, hwidHash).first();
    if (!device) return json({ valid: false, reason: "HWID_MISMATCH", request_id: requestId });
    if (device.status === "blocked") return json({ valid: false, reason: "HWID_BLOCKED", request_id: requestId }, 403, requestId);
    await env.DB.prepare("UPDATE devices SET last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(device.id).run();
    await env.DB.prepare("UPDATE licenses SET current_hwid = ?1, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?2").bind(hwidHash, licenseId).run();
    return json({ valid: true, device_id: device.id, request_id: requestId });
  } catch {
    return jsonError(json, 503, "DATABASE_ERROR", requestId);
  }
}

export async function resetHwid(request, env, requestId, json, licenseId) {
  if (!env.DB) return jsonError(json, 503, "DATABASE_UNAVAILABLE", requestId);
  licenseId = normalizeLicenseId(licenseId);
  if (!licenseId || licenseId.length > 128) return jsonError(json, 400, "INVALID_LICENSE_ID", requestId);
  try {
    const license = await licenseFor(env, licenseId);
    const licenseError = licenseUsable(license);
    if (licenseError) return jsonError(json, licenseError === "LICENSE_NOT_FOUND" ? 404 : 409, licenseError, requestId);
    const cooldownUntil = license.hwid_reset_cooldown_until ? new Date(license.hwid_reset_cooldown_until).getTime() : 0;
    if (cooldownUntil > Date.now()) return jsonError(json, 429, "HWID_RESET_COOLDOWN", requestId, { available_at: license.hwid_reset_cooldown_until });
    const resetAt = isoNow();
    const cooldown = new Date(Date.now() + parseCooldown(env) * 1000).toISOString();
    await env.DB.prepare("UPDATE devices SET status = 'blocked', blocked_at = ?1, blocked_reason = 'HWID_RESET', updated_at = CURRENT_TIMESTAMP WHERE license_id = ?2 AND status = 'active'").bind(resetAt, licenseId).run();
    await env.DB.prepare("UPDATE licenses SET current_hwid = NULL, hwid_reset_at = ?1, hwid_reset_cooldown_until = ?2, reset_count = reset_count + 1, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?3").bind(resetAt, cooldown, licenseId).run();
    await audit(env, licenseId, "HWID_RESET", "cooldown");
    return json({ reset: true, reset_at: resetAt, available_at: cooldown, request_id: requestId });
  } catch {
    return jsonError(json, 503, "DATABASE_ERROR", requestId);
  }
}

async function setDeviceStatus(env, json, requestId, deviceId, status) {
  if (!env.DB) return jsonError(json, 503, "DATABASE_UNAVAILABLE", requestId);
  if (!deviceId || deviceId.length > 128) return jsonError(json, 400, "INVALID_DEVICE_ID", requestId);
  try {
    const device = await env.DB.prepare("SELECT id, license_id, status FROM devices WHERE id = ?1 LIMIT 1").bind(deviceId).first();
    if (!device) return jsonError(json, 404, "DEVICE_NOT_FOUND", requestId);
    const blockedAt = status === "blocked" ? isoNow() : null;
    const reason = status === "blocked" ? "ADMIN_BLOCK" : null;
    await env.DB.prepare("UPDATE devices SET status = ?1, blocked_at = ?2, blocked_reason = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4").bind(status, blockedAt, reason, deviceId).run();
    await audit(env, device.license_id, status === "blocked" ? "HWID_BLOCKED" : "HWID_UNBLOCKED", status);
    return json({ updated: true, device: { id: deviceId, status }, request_id: requestId });
  } catch {
    return jsonError(json, 503, "DATABASE_ERROR", requestId);
  }
}

export async function blockHwid(request, env, requestId, json, deviceId) {
  return setDeviceStatus(env, json, requestId, deviceId, "blocked");
}

export async function unblockHwid(request, env, requestId, json, deviceId) {
  return setDeviceStatus(env, json, requestId, deviceId, "active");
}
