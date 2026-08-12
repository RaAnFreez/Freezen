const encoder = new TextEncoder();
const MAX_ID_LENGTH = 128;
const MAX_HWID_LENGTH = 512;

const sha256Hex = async (value) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const normalize = (value) => typeof value === "string" ? value.trim() : "";
const normalizeStatus = (value) => normalize(value).toUpperCase();
const expired = (value) => {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return !Number.isNaN(timestamp) && timestamp <= Date.now();
};

const errorResponse = (json, status, error, requestId, extra = {}) =>
  json({ authorized: false, error, request_id: requestId, ...extra }, status, requestId);

async function audit(env, userId, action, resourceId, status, requestId, metadata = {}) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO audit_logs (id,user_id,action,resource_type,resource_id,status,request_id,metadata_json) VALUES (?1,?2,?3,'script',?4,?5,?6,?7)",
    ).bind(crypto.randomUUID(), userId ?? null, action, resourceId ?? null, status, requestId, JSON.stringify(metadata)).run();
  } catch {
    // Authorization must not expose database internals if audit logging fails.
  }
}

export async function authorizeScriptAccess(request, env, requestId, json, auth, scriptId) {
  if (!env.DB || !auth?.user_id) return errorResponse(json, 401, "SESSION_AUTH_REQUIRED", requestId);
  if (!scriptId || scriptId.length > MAX_ID_LENGTH) return errorResponse(json, 400, "INVALID_SCRIPT_ID", requestId);

  let body;
  try { body = await request.json(); } catch { return errorResponse(json, 400, "INVALID_JSON", requestId); }

  const licenseId = normalize(body?.license_id);
  const rawHwid = normalize(body?.hwid);
  const requestedVersionId = normalize(body?.version_id);
  if (!licenseId || licenseId.length > MAX_ID_LENGTH) return errorResponse(json, 400, "INVALID_LICENSE_ID", requestId);
  if (!rawHwid || rawHwid.length > MAX_HWID_LENGTH) return errorResponse(json, 400, "INVALID_HWID", requestId);
  if (requestedVersionId && requestedVersionId.length > MAX_ID_LENGTH) return errorResponse(json, 400, "INVALID_VERSION_ID", requestId);

  try {
    const user = await env.DB.prepare("SELECT id,status FROM users WHERE id=?1 LIMIT 1").bind(auth.user_id).first();
    if (!user) return errorResponse(json, 401, "ACCOUNT_NOT_FOUND", requestId);
    if (normalizeStatus(user.status) !== "ACTIVE") {
      await audit(env, auth.user_id, "SCRIPT_AUTHORIZATION_DENIED", scriptId, "DENIED", requestId, { reason: "ACCOUNT_INACTIVE" });
      return errorResponse(json, 403, "ACCOUNT_INACTIVE", requestId);
    }

    const script = await env.DB.prepare(
      "SELECT s.id,s.product_id,s.status,p.status AS product_status FROM scripts s JOIN products p ON p.id=s.product_id WHERE s.id=?1 LIMIT 1",
    ).bind(scriptId).first();
    if (!script) return errorResponse(json, 404, "SCRIPT_NOT_FOUND", requestId);
    if (normalizeStatus(script.status) !== "ACTIVE") {
      await audit(env, auth.user_id, "SCRIPT_AUTHORIZATION_DENIED", scriptId, "DENIED", requestId, { reason: "SCRIPT_DISABLED" });
      return errorResponse(json, 403, "SCRIPT_DISABLED", requestId);
    }
    if (normalizeStatus(script.product_status) !== "ACTIVE") {
      await audit(env, auth.user_id, "SCRIPT_AUTHORIZATION_DENIED", scriptId, "DENIED", requestId, { reason: "PRODUCT_DISABLED" });
      return errorResponse(json, 403, "PRODUCT_DISABLED", requestId);
    }

    const license = await env.DB.prepare(
      "SELECT id,user_id,product_id,status,expires_at,max_devices FROM licenses WHERE id=?1 LIMIT 1",
    ).bind(licenseId).first();
    if (!license) return errorResponse(json, 404, "LICENSE_NOT_FOUND", requestId);
    if (license.user_id !== auth.user_id) {
      await audit(env, auth.user_id, "SCRIPT_AUTHORIZATION_DENIED", scriptId, "DENIED", requestId, { reason: "LICENSE_OWNERSHIP_REQUIRED", license_id: licenseId });
      return errorResponse(json, 403, "LICENSE_OWNERSHIP_REQUIRED", requestId);
    }

    const status = normalizeStatus(license.status);
    if (status === "EXPIRED" || expired(license.expires_at)) {
      await audit(env, auth.user_id, "SCRIPT_AUTHORIZATION_DENIED", scriptId, "DENIED", requestId, { reason: "LICENSE_EXPIRED", license_id: licenseId });
      return errorResponse(json, 403, "LICENSE_EXPIRED", requestId);
    }
    if (status === "REVOKED") {
      await audit(env, auth.user_id, "SCRIPT_AUTHORIZATION_DENIED", scriptId, "DENIED", requestId, { reason: "LICENSE_REVOKED", license_id: licenseId });
      return errorResponse(json, 403, "LICENSE_REVOKED", requestId);
    }
    if (status === "BANNED") {
      await audit(env, auth.user_id, "SCRIPT_AUTHORIZATION_DENIED", scriptId, "DENIED", requestId, { reason: "LICENSE_BANNED", license_id: licenseId });
      return errorResponse(json, 403, "LICENSE_BANNED", requestId);
    }
    if (status !== "ACTIVE") {
      await audit(env, auth.user_id, "SCRIPT_AUTHORIZATION_DENIED", scriptId, "DENIED", requestId, { reason: "LICENSE_INACTIVE", license_id: licenseId });
      return errorResponse(json, 403, "LICENSE_INACTIVE", requestId);
    }
    if (license.product_id !== script.product_id) {
      await audit(env, auth.user_id, "SCRIPT_AUTHORIZATION_DENIED", scriptId, "DENIED", requestId, { reason: "PRODUCT_LICENSE_MISMATCH", license_id: licenseId });
      return errorResponse(json, 403, "PRODUCT_LICENSE_MISMATCH", requestId);
    }

    const hwidHash = await sha256Hex(rawHwid);
    const device = await env.DB.prepare(
      "SELECT id,status FROM devices WHERE license_id=?1 AND user_id=?2 AND hwid_hash=?3 LIMIT 1",
    ).bind(licenseId, auth.user_id, hwidHash).first();
    if (!device) {
      await audit(env, auth.user_id, "SCRIPT_AUTHORIZATION_DENIED", scriptId, "DENIED", requestId, { reason: "HWID_MISMATCH", license_id: licenseId });
      return errorResponse(json, 403, "HWID_MISMATCH", requestId);
    }
    if (normalizeStatus(device.status) !== "ACTIVE") {
      await audit(env, auth.user_id, "SCRIPT_AUTHORIZATION_DENIED", scriptId, "DENIED", requestId, { reason: "HWID_BLOCKED", license_id: licenseId, device_id: device.id });
      return errorResponse(json, 403, "HWID_BLOCKED", requestId);
    }

    let version;
    if (requestedVersionId) {
      version = await env.DB.prepare(
        "SELECT id,version,status FROM script_versions WHERE id=?1 AND script_id=?2 LIMIT 1",
      ).bind(requestedVersionId, scriptId).first();
      if (!version) return errorResponse(json, 404, "SCRIPT_VERSION_NOT_FOUND", requestId);
      if (normalizeStatus(version.status) !== "ACTIVE") return errorResponse(json, 403, "SCRIPT_VERSION_NOT_ACTIVE", requestId);
    } else {
      version = await env.DB.prepare(
        "SELECT id,version,status FROM script_versions WHERE script_id=?1 AND status='ACTIVE' LIMIT 1",
      ).bind(scriptId).first();
      if (!version) return errorResponse(json, 409, "ACTIVE_SCRIPT_VERSION_NOT_FOUND", requestId);
    }

    await env.DB.batch([
      env.DB.prepare("UPDATE devices SET last_seen=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1").bind(device.id),
      env.DB.prepare("UPDATE licenses SET current_hwid=?1,last_seen=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?2 AND user_id=?3").bind(hwidHash, licenseId, auth.user_id),
    ]);
    await audit(env, auth.user_id, "SCRIPT_AUTHORIZED", scriptId, "SUCCESS", requestId, { license_id: licenseId, product_id: script.product_id, version_id: version.id });

    return json({
      authorized: true,
      license: { id: license.id, product_id: license.product_id, status: "ACTIVE", expires_at: license.expires_at },
      script: { id: script.id, product_id: script.product_id, status: "ACTIVE" },
      version: { id: version.id, version: version.version, status: "ACTIVE" },
      device: { id: device.id, status: "ACTIVE" },
      request_id: requestId,
    }, 200, requestId);
  } catch {
    return errorResponse(json, 503, "DATABASE_ERROR", requestId);
  }
}
