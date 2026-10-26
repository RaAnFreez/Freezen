import { bindHwidV2, validateHwidV2 } from "./hwid-v2.js";

const encoder = new TextEncoder();
const MAX_LICENSE_KEY_LENGTH = 512;
const MAX_PRODUCT_ID_LENGTH = 128;
const MAX_HWID_LENGTH = 512;

const sha256Hex = async (value) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const readText = (value) => typeof value === "string" ? value.trim() : "";

const statusCode = (reason) => ({
  INVALID_JSON: 400,
  INVALID_LICENSE_KEY: 400,
  INVALID_PRODUCT_ID: 400,
  INVALID_HWID: 400,
  LICENSE_NOT_FOUND: 404,
  PRODUCT_NOT_FOUND: 404,
  PRODUCT_LICENSE_MISMATCH: 403,
  PRODUCT_DISABLED: 403,
  LICENSE_INACTIVE: 403,
  LICENSE_EXPIRED: 403,
  LICENSE_EXPIRY_INVALID: 403,
  LICENSE_REVOKED: 403,
  LICENSE_BANNED: 403,
  LICENSE_BLOCKED: 403,
  HWID_BLOCKED: 403,
  DEVICE_LIMIT_REACHED: 409,
  DATABASE_UNAVAILABLE: 503,
  DATABASE_ERROR: 503,
}[reason] ?? 403);

function deny(json, requestId, reason) {
  return json({ valid: false, reason, request_id: requestId }, statusCode(reason), requestId);
}

/**
 * Public client validation for applications that are intentionally integrated
 * with Frezen's own licensing API. The license key is a client credential.
 *
 * This endpoint does not emulate third-party APIs. Clients must explicitly
 * implement this contract; an existing APK will not use it just because the
 * Worker route exists.
 */
export async function validateClientLicense(request, env, requestId, json) {
  if (!env?.DB) return deny(json, requestId, "DATABASE_UNAVAILABLE");

  let body;
  try {
    body = await request.json();
  } catch {
    return deny(json, requestId, "INVALID_JSON");
  }

  const licenseKey = readText(body?.license_key);
  const productId = readText(body?.product_id);
  const hwid = readText(body?.hwid);

  if (!licenseKey || licenseKey.length > MAX_LICENSE_KEY_LENGTH) return deny(json, requestId, "INVALID_LICENSE_KEY");
  if (!productId || productId.length > MAX_PRODUCT_ID_LENGTH) return deny(json, requestId, "INVALID_PRODUCT_ID");
  if (!hwid || hwid.length > MAX_HWID_LENGTH) return deny(json, requestId, "INVALID_HWID");

  try {
    const licenseKeyHash = await sha256Hex(licenseKey);
    const license = await env.DB.prepare(
      "SELECT id, product_id, status, expires_at, max_devices FROM licenses WHERE license_key_hash = ?1 LIMIT 1",
    ).bind(licenseKeyHash).first();

    if (!license) return deny(json, requestId, "LICENSE_NOT_FOUND");

    if (String(license.product_id ?? "") !== productId) {
      return deny(json, requestId, "PRODUCT_LICENSE_MISMATCH");
    }

    const status = String(license.status ?? "").trim().toLowerCase();
    if (status === "revoked") return deny(json, requestId, "LICENSE_REVOKED");
    if (status === "banned") return deny(json, requestId, "LICENSE_BANNED");
    if (status !== "active") return deny(json, requestId, "LICENSE_INACTIVE");

    if (license.expires_at) {
      const expiresAt = Date.parse(license.expires_at);
      if (!Number.isFinite(expiresAt)) return deny(json, requestId, "LICENSE_EXPIRY_INVALID");
      if (expiresAt <= Date.now()) {
        try {
          await env.DB.prepare(
            "UPDATE licenses SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?1 AND status = 'active'",
          ).bind(license.id).run();
        } catch {
          // Access is denied even if expiry status synchronization fails.
        }
        return deny(json, requestId, "LICENSE_EXPIRED");
      }
    }

    const product = await env.DB.prepare(
      "SELECT id, status FROM products WHERE id = ?1 LIMIT 1",
    ).bind(productId).first();

    if (!product) return deny(json, requestId, "PRODUCT_NOT_FOUND");
    if (String(product.status ?? "").trim().toLowerCase() !== "active") {
      return deny(json, requestId, "PRODUCT_DISABLED");
    }

    let device = await validateHwidV2(env, { licenseId: license.id, rawHwid: hwid });
    let newlyBound = false;
    if (!device.ok && device.reason === "HWID_MISMATCH") {
      device = await bindHwidV2(env, { licenseId: license.id, rawHwid: hwid });
      newlyBound = Boolean(device.ok && !device.existing);
    }
    if (!device.ok) return deny(json, requestId, device.reason ?? "DATABASE_ERROR");

    return json({
      valid: true,
      license: {
        id: license.id,
        product_id: license.product_id,
        status: "active",
        expires_at: license.expires_at ?? null,
        lifetime: license.expires_at == null,
        max_devices: Number.isInteger(Number(license.max_devices)) ? Number(license.max_devices) : 1,
      },
      device: {
        bound: true,
        newly_bound: newlyBound,
        fingerprint: device.fingerprint ?? null,
      },
      request_id: requestId,
    }, 200, requestId);
  } catch (error) {
    console.error("client license validation failed", {
      requestId,
      error: String(error?.message ?? error),
    });
    return deny(json, requestId, "DATABASE_ERROR");
  }
}
