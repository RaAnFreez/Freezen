const encoder = new TextEncoder();

const sha256Hex = async (value) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const randomBytes = (size) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
};

const randomToken = (size = 24) => Array.from(randomBytes(size), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();

const normalizeStatus = (status) => typeof status === "string" ? status.trim().toLowerCase() : "";

const parseDays = (value) => {
  const days = Number(value);
  return Number.isInteger(days) && days > 0 && days <= 3650 ? days : null;
};

const parseLicenseId = (licenseId, json, requestId) => {
  if (!licenseId || licenseId.length > 128) return json({ error: "INVALID_LICENSE_ID", request_id: requestId }, 400, requestId);
  return null;
};

const audit = async (env, licenseId, previousStatus, newStatus) => {
  if (!env.DB) return;
  await env.DB.prepare(
    "INSERT INTO license_audit_log (id, license_id, previous_status, new_status) VALUES (?1, ?2, ?3, ?4)",
  ).bind(crypto.randomUUID(), licenseId, previousStatus ?? null, newStatus).run();
};

const expired = (expiresAt) => {
  if (!expiresAt) return false;
  const timestamp = new Date(expiresAt).getTime();
  return !Number.isNaN(timestamp) && timestamp <= Date.now();
};

const isoAfterDays = (days, base = Date.now()) => new Date(base + days * 86400000).toISOString();

export async function generateLicense(request, env, requestId, json, auth) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);

  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }

  const productId = typeof body?.product_id === "string" ? body.product_id.trim() : "";
  const userId = typeof body?.user_id === "string" && body.user_id.trim() ? body.user_id.trim() : null;
  const days = body?.duration_days == null ? null : parseDays(body.duration_days);
  const maxDevices = body?.max_devices == null ? 1 : Number(body.max_devices);
  if (!productId || productId.length > 128) return json({ error: "INVALID_PRODUCT_ID", request_id: requestId }, 400, requestId);
  if (body?.duration_days != null && days == null) return json({ error: "INVALID_DURATION_DAYS", request_id: requestId }, 400, requestId);
  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 100) return json({ error: "INVALID_MAX_DEVICES", request_id: requestId }, 400, requestId);

  const licenseKey = `FREZEN-${randomToken(4)}-${randomToken(4)}-${randomToken(4)}-${randomToken(4)}`;
  const keyHash = await sha256Hex(licenseKey);
  const licenseId = crypto.randomUUID();
  const expiresAt = days ? isoAfterDays(days) : null;

  try {
    const product = await env.DB.prepare("SELECT id, status FROM products WHERE id = ?1 LIMIT 1").bind(productId).first();
    if (!product) return json({ error: "PRODUCT_NOT_FOUND", request_id: requestId }, 404, requestId);
    if (normalizeStatus(product.status) !== "active") return json({ error: "PRODUCT_DISABLED", request_id: requestId }, 409, requestId);

    if (userId) {
      const user = await env.DB.prepare("SELECT id FROM users WHERE id = ?1 LIMIT 1").bind(userId).first();
      if (!user) return json({ error: "USER_NOT_FOUND", request_id: requestId }, 404, requestId);
    }

    await env.DB.prepare(
      "INSERT INTO licenses (id, key_hash, license_key_hash, product_id, user_id, status, expires_at, max_devices) VALUES (?1, ?2, ?2, ?3, ?4, 'active', ?5, ?6)",
    ).bind(licenseId, keyHash, productId, userId, expiresAt, maxDevices).run();

    await audit(env, licenseId, null, "active");
    return json({
      created: true,
      license: { id: licenseId, product_id: productId, user_id: userId, status: "active", expires_at: expiresAt, max_devices: maxDevices },
      license_key: licenseKey,
      warning: "The plaintext license key is returned only in this creation response and is never stored by Frezen.",
      created_by: auth?.user_id ?? null,
      request_id: requestId,
    }, 201, requestId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function redeemLicense(request, env, requestId, json, auth) {
  if (!env.DB || !auth?.user_id) return json({ error: "SESSION_AUTH_REQUIRED", request_id: requestId }, 401, requestId);
  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const licenseKey = typeof body?.license_key === "string" ? body.license_key.trim() : "";
  if (!licenseKey || licenseKey.length > 512) return json({ error: "INVALID_LICENSE_KEY", request_id: requestId }, 400, requestId);

  try {
    const keyHash = await sha256Hex(licenseKey);
    const license = await env.DB.prepare("SELECT id, user_id, product_id, status, expires_at, redeem_count FROM licenses WHERE license_key_hash = ?1 OR key_hash = ?1 LIMIT 1").bind(keyHash).first();
    if (!license) return json({ error: "LICENSE_NOT_FOUND", request_id: requestId }, 404, requestId);
    const status = normalizeStatus(license.status);
    if (status === "revoked") return json({ error: "LICENSE_REVOKED", request_id: requestId }, 403, requestId);
    if (status === "banned") return json({ error: "LICENSE_BANNED", request_id: requestId }, 403, requestId);
    if (status === "expired" || expired(license.expires_at)) return json({ error: "LICENSE_EXPIRED", request_id: requestId }, 403, requestId);
    if (status !== "unused") {
      if (license.user_id === auth.user_id) return json({ error: "LICENSE_ALREADY_REDEEMED", request_id: requestId }, 409, requestId);
      return json({ error: "LICENSE_UNAVAILABLE", request_id: requestId }, 409, requestId);
    }

    const result = await env.DB.prepare(
      "UPDATE licenses SET user_id = ?1, status = 'active', redeem_count = redeem_count + 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?2 AND status = 'unused' AND user_id IS NULL",
    ).bind(auth.user_id, license.id).run();
    if (!result?.meta || result.meta.changes !== 1) return json({ error: "LICENSE_REDEEM_CONFLICT", request_id: requestId }, 409, requestId);

    await audit(env, license.id, "unused", "active");
    return json({ redeemed: true, license: { id: license.id, product_id: license.product_id, status: "active", expires_at: license.expires_at }, request_id: requestId }, 200, requestId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function extendLicense(request, env, requestId, json, licenseId) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  const invalid = parseLicenseId(licenseId, json, requestId);
  if (invalid) return invalid;
  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const days = parseDays(body?.duration_days);
  if (days == null) return json({ error: "INVALID_DURATION_DAYS", request_id: requestId }, 400, requestId);

  try {
    const license = await env.DB.prepare("SELECT id, status, expires_at FROM licenses WHERE id = ?1 LIMIT 1").bind(licenseId).first();
    if (!license) return json({ error: "LICENSE_NOT_FOUND", request_id: requestId }, 404, requestId);
    const status = normalizeStatus(license.status);
    if (["revoked", "banned"].includes(status)) return json({ error: "LICENSE_NOT_EXTENDABLE", request_id: requestId }, 409, requestId);
    const current = license.expires_at ? new Date(license.expires_at).getTime() : Date.now();
    const base = Number.isNaN(current) || current < Date.now() ? Date.now() : current;
    const expiresAt = isoAfterDays(days, base);
    const nextStatus = status === "expired" ? "active" : status;
    await env.DB.prepare("UPDATE licenses SET expires_at = ?1, status = ?2, last_seen = CURRENT_TIMESTAMP WHERE id = ?3").bind(expiresAt, nextStatus, licenseId).run();
    if (nextStatus !== status) await audit(env, licenseId, status, nextStatus);
    return json({ extended: true, license: { id: licenseId, status: nextStatus, expires_at: expiresAt }, request_id: requestId }, 200, requestId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function resetLicenseHwid(request, env, requestId, json, licenseId) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  const invalid = parseLicenseId(licenseId, json, requestId);
  if (invalid) return invalid;
  try {
    const license = await env.DB.prepare("SELECT id, status, reset_count FROM licenses WHERE id = ?1 LIMIT 1").bind(licenseId).first();
    if (!license) return json({ error: "LICENSE_NOT_FOUND", request_id: requestId }, 404, requestId);
    const status = normalizeStatus(license.status);
    if (["revoked", "banned"].includes(status)) return json({ error: "LICENSE_NOT_RESETTABLE", request_id: requestId }, 409, requestId);
    await env.DB.prepare("UPDATE licenses SET current_hwid = NULL, reset_count = reset_count + 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?1").bind(licenseId).run();
    return json({ reset: true, license: { id: licenseId, status: license.status, reset_count: Number(license.reset_count ?? 0) + 1 }, request_id: requestId }, 200, requestId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}
