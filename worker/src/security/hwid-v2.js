const encoder = new TextEncoder();
const MAX_HWID_LENGTH = 512;
const DEFAULT_MAX_DEVICES = 1;

const sha256Hex = async (value) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const normalize = (value, max = 128) => typeof value === "string" ? value.trim().slice(0, max) : "";
const json = (body, status, requestId) => new Response(JSON.stringify({ ...body, request_id: requestId }), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function maxDevicesForLicense(env, licenseId) {
  try {
    const row = await env.DB.prepare(
      "SELECT max_devices FROM frezen_key_limits kl JOIN frezen_key_records kr ON kr.id = kl.key_id WHERE kr.license_id = ?1 LIMIT 1",
    ).bind(licenseId).first();
    const value = Number(row?.max_devices);
    return Number.isInteger(value) && value > 0 && value <= 100 ? value : DEFAULT_MAX_DEVICES;
  } catch {
    return DEFAULT_MAX_DEVICES;
  }
}

async function licenseFor(env, licenseId) {
  return env.DB.prepare(
    "SELECT id, user_id, status, expires_at FROM licenses WHERE id = ?1 LIMIT 1",
  ).bind(licenseId).first();
}

function licenseState(license) {
  if (!license) return "LICENSE_NOT_FOUND";
  const status = String(license.status ?? "").toLowerCase();
  if (["revoked", "banned"].includes(status)) return "LICENSE_BLOCKED";
  if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) return "LICENSE_EXPIRED";
  return null;
}

async function getBinding(env, licenseId, hwidHash) {
  return env.DB.prepare(
    "SELECT id, owner_id, license_id, status, first_seen, last_seen, blocked_at, blocked_reason FROM hwid_bindings_v2 WHERE license_id = ?1 AND hwid_hash = ?2 LIMIT 1",
  ).bind(licenseId, hwidHash).first();
}

export async function bindHwidV2(env, { licenseId, ownerId = null, rawHwid }) {
  if (!env?.DB) return { ok: false, reason: "DATABASE_UNAVAILABLE" };
  const id = normalize(licenseId);
  const hwid = normalize(rawHwid, MAX_HWID_LENGTH);
  if (!id || !hwid) return { ok: false, reason: "INVALID_HWID" };

  try {
    const license = await licenseFor(env, id);
    const state = licenseState(license);
    if (state) return { ok: false, reason: state };

    const hwidHash = await sha256Hex(hwid);
    const existing = await getBinding(env, id, hwidHash);
    if (existing) {
      if (existing.status === "blocked") return { ok: false, reason: "HWID_BLOCKED" };
      await env.DB.prepare(
        "UPDATE hwid_bindings_v2 SET last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
      ).bind(existing.id).run();
      return { ok: true, existing: true, deviceId: existing.id, fingerprint: hwidHash.slice(0, 12) };
    }

    const maxDevices = await maxDevicesForLicense(env, id);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM hwid_bindings_v2 WHERE license_id = ?1 AND status = 'active'",
    ).bind(id).first();
    if (Number(count?.total ?? 0) >= maxDevices) return { ok: false, reason: "DEVICE_LIMIT_REACHED" };

    const deviceId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO hwid_bindings_v2 (id, owner_id, license_id, hwid_hash, status) VALUES (?1, ?2, ?3, ?4, 'active')",
    ).bind(deviceId, ownerId ?? license.user_id ?? null, id, hwidHash).run();

    return { ok: true, existing: false, deviceId, fingerprint: hwidHash.slice(0, 12) };
  } catch (error) {
    console.error("HWID V2 bind failed", { licenseId: id, message: String(error?.message ?? error) });
    return { ok: false, reason: "DATABASE_ERROR" };
  }
}

export async function validateHwidV2(env, { licenseId, rawHwid, ownerId = null }) {
  if (!env?.DB) return { ok: false, reason: "DATABASE_UNAVAILABLE" };
  const id = normalize(licenseId);
  const hwid = normalize(rawHwid, MAX_HWID_LENGTH);
  if (!id || !hwid) return { ok: false, reason: "INVALID_HWID" };

  try {
    const license = await licenseFor(env, id);
    const state = licenseState(license);
    if (state) return { ok: false, reason: state };
    if (ownerId && license.user_id && license.user_id !== ownerId) return { ok: false, reason: "LICENSE_OWNERSHIP_REQUIRED" };

    const hwidHash = await sha256Hex(hwid);
    const binding = await getBinding(env, id, hwidHash);
    if (!binding) return { ok: false, reason: "HWID_MISMATCH" };
    if (binding.status === "blocked") return { ok: false, reason: "HWID_BLOCKED" };

    await env.DB.prepare(
      "UPDATE hwid_bindings_v2 SET last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
    ).bind(binding.id).run();
    return { ok: true, deviceId: binding.id, fingerprint: hwidHash.slice(0, 12) };
  } catch (error) {
    console.error("HWID V2 validation failed", { licenseId: id, message: String(error?.message ?? error) });
    return { ok: false, reason: "DATABASE_ERROR" };
  }
}

export async function listHwidV2(env, { ownerId, licenseId = null }) {
  if (!env?.DB) return { ok: false, reason: "DATABASE_UNAVAILABLE" };
  const owner = normalize(ownerId);
  const license = normalize(licenseId);
  if (!owner) return { ok: false, reason: "SESSION_AUTH_REQUIRED" };

  try {
    const where = license ? "WHERE h.owner_id = ?1 AND h.license_id = ?2" : "WHERE h.owner_id = ?1";
    const bindings = license ? [owner, license] : [owner];
    const rows = await env.DB.prepare(`
      SELECT h.id, h.license_id, h.status, h.first_seen, h.last_seen, h.blocked_at, h.blocked_reason, h.created_at, h.updated_at,
             l.expires_at, kr.key_name, kr.service_id, s.name AS service_name,
             substr(h.hwid_hash, 1, 12) AS fingerprint
      FROM hwid_bindings_v2 h
      JOIN licenses l ON l.id = h.license_id
      LEFT JOIN frezen_key_records kr ON kr.license_id = h.license_id
      LEFT JOIN frezen_key_services s ON s.id = kr.service_id
      ${where}
      ORDER BY CASE WHEN h.status = 'blocked' THEN 0 ELSE 1 END, h.last_seen DESC
      LIMIT 500
    `).bind(...bindings).all();
    return { ok: true, devices: rows.results ?? [] };
  } catch (error) {
    console.error("HWID V2 listing failed", { message: String(error?.message ?? error) });
    return { ok: false, reason: "DATABASE_ERROR" };
  }
}

export async function setHwidStatusV2(env, { ownerId, deviceId, status }) {
  if (!env?.DB) return { ok: false, reason: "DATABASE_UNAVAILABLE" };
  const owner = normalize(ownerId);
  const id = normalize(deviceId);
  const nextStatus = status === "blocked" ? "blocked" : status === "active" ? "active" : "";
  if (!owner || !id || !nextStatus) return { ok: false, reason: "INVALID_REQUEST" };

  try {
    const existing = await env.DB.prepare(
      "SELECT id FROM hwid_bindings_v2 WHERE id = ?1 AND owner_id = ?2 LIMIT 1",
    ).bind(id, owner).first();
    if (!existing) return { ok: false, reason: "DEVICE_NOT_FOUND" };

    await env.DB.prepare(
      "UPDATE hwid_bindings_v2 SET status = ?1, blocked_at = ?2, blocked_reason = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4 AND owner_id = ?5",
    ).bind(nextStatus, nextStatus === "blocked" ? new Date().toISOString() : null, nextStatus === "blocked" ? "ADMIN_BLOCK" : null, id, owner).run();
    return { ok: true, status: nextStatus };
  } catch (error) {
    console.error("HWID V2 status update failed", { deviceId: id, message: String(error?.message ?? error) });
    return { ok: false, reason: "DATABASE_ERROR" };
  }
}

export async function resetHwidV2(env, { ownerId, licenseId }) {
  if (!env?.DB) return { ok: false, reason: "DATABASE_UNAVAILABLE" };
  const owner = normalize(ownerId);
  const id = normalize(licenseId);
  if (!owner || !id) return { ok: false, reason: "INVALID_REQUEST" };

  try {
    const license = await licenseFor(env, id);
    const state = licenseState(license);
    if (state) return { ok: false, reason: state };
    if (license.user_id !== owner) return { ok: false, reason: "LICENSE_OWNERSHIP_REQUIRED" };

    const resetAt = new Date().toISOString();
    await env.DB.prepare(
      "UPDATE hwid_bindings_v2 SET status = 'blocked', blocked_at = ?1, blocked_reason = 'HWID_RESET', updated_at = CURRENT_TIMESTAMP WHERE owner_id = ?2 AND license_id = ?3 AND status = 'active'",
    ).bind(resetAt, owner, id).run();
    return { ok: true, resetAt };
  } catch (error) {
    console.error("HWID V2 reset failed", { licenseId: id, message: String(error?.message ?? error) });
    return { ok: false, reason: "DATABASE_ERROR" };
  }
}

export async function cleanupHwidV2(env) {
  if (!env?.DB) return { removed: 0 };
  try {
    const result = await env.DB.prepare(`
      DELETE FROM hwid_bindings_v2
      WHERE license_id IN (
        SELECT id FROM licenses
        WHERE expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')
      )
    `).run();
    return { removed: Number(result?.meta?.changes ?? 0) };
  } catch (error) {
    console.error("HWID V2 cleanup failed", { message: String(error?.message ?? error) });
    return { removed: 0 };
  }
}
