import { generateLicense } from "./security/license-lifecycle.js";
import { listLicenses } from "./security/license-list.js";
import { hasPermission } from "./security/roles.js";
import { listHwidV2, setHwidStatusV2 } from "./security/hwid-v2.js";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

const reply = (data, status = 200, requestId = crypto.randomUUID()) =>
  new Response(JSON.stringify({ ...data, request_id: requestId }), { status, headers: HEADERS });

const sha256Hex = async (value) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const normalizeAction = (value) => String(value ?? "").trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export function canonicalSeAction(value) {
  const action = normalizeAction(value);
  const aliases = {
    auth: "authenticate",
    login: "authenticate",
    check_token: "authenticate",
    verify_token: "authenticate",
    create_key: "generate_key",
    new_key: "generate_key",
    generate_license: "generate_key",
    create_license: "generate_key",
    get_keys: "list_keys",
    keys: "list_keys",
    licenses: "list_keys",
    get_hwid: "list_hwid",
    devices: "list_hwid",
    list_devices: "list_hwid",
    block_hwid: "ban_hwid",
    ban_device: "ban_hwid",
    block_device: "ban_hwid",
    unblock_hwid: "unban_hwid",
    unban_device: "unban_hwid",
    unblock_device: "unban_hwid",
    top_up: "topup",
    purchase: "topup",
    buy_subscription: "topup",
  };
  return aliases[action] ?? action;
}

async function parseBody(request, url) {
  const raw = await request.clone().text();
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  if (contentType.includes("multipart/form-data")) {
    throw new Error("MULTIPART_NOT_SUPPORTED");
  }
  if (raw.trim()) {
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_JSON");
      return value;
    } catch {
      if (contentType.includes("application/json")) throw new Error("INVALID_JSON");
      return Object.fromEntries(new URLSearchParams(raw).entries());
    }
  }
  return Object.fromEntries(url.searchParams.entries());
}

async function authenticateApiKey(request, body, env) {
  if (!env.DB) return { error: "DATABASE_UNAVAILABLE", status: 503 };
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  const secret = (bearer || body.access_token || body.accessToken || body.api_key || body.apiKey || body.token || "").toString().trim();
  if (!secret || secret.length > 256) return { error: "FREZEN_API_KEY_REQUIRED", status: 401 };

  const keyHash = await sha256Hex(secret);
  let key;
  try {
    key = await env.DB.prepare(
      "SELECT id, owner_user_id, scopes_json, expires_at, revoked_at FROM api_keys WHERE key_hash = ?1 LIMIT 1"
    ).bind(keyHash).first();
  } catch {
    return { error: "API_KEY_SCHEMA_UNAVAILABLE", status: 503 };
  }
  if (!key || key.revoked_at || (key.expires_at && Date.parse(key.expires_at) <= Date.now())) {
    return { error: "INVALID_OR_EXPIRED_API_KEY", status: 401 };
  }

  let user;
  try {
    user = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?1 LIMIT 1").bind(key.owner_user_id).first();
  } catch {
    return { error: "USER_LOOKUP_FAILED", status: 503 };
  }
  if (!user?.id || !user?.role) return { error: "API_KEY_OWNER_UNAVAILABLE", status: 403 };

  let scopes = [];
  try { scopes = JSON.parse(key.scopes_json || "[]"); } catch { scopes = []; }
  if (!Array.isArray(scopes)) scopes = [];

  try {
    await env.DB.prepare("UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?1 AND revoked_at IS NULL")
      .bind(key.id).run();
  } catch {
    // Last-used bookkeeping is best-effort; authorization is still evaluated below.
  }
  return {
    auth: { user_id: user.id, role: user.role },
    scopes: new Set(scopes.filter((scope) => typeof scope === "string")),
  };
}

function hasScope(scopes, required) {
  return scopes.has("*") || scopes.has(required);
}

function requiredPermission(action) {
  if (action === "generate_key") return { permission: "licenses:write", scope: "licenses:write" };
  if (action === "list_keys") return { permission: "licenses:read", scope: "licenses:read" };
  if (action === "list_hwid") return { permission: "hwid:read", scope: "hwid:read" };
  if (action === "ban_hwid" || action === "unban_hwid") return { permission: "hwid:write", scope: "hwid:write" };
  return null;
}

/**
 * Compatibility bridge for an owner-controlled rebuild/repoint of SE 2.2.6.
 *
 * This route is intentionally feature-gated. It accepts only the documented
 * Frezen action contract; it does not proxy requests to any SE/SnakeEngine host.
 * The legacy APK's precise request/response contract is not published in the
 * decompiled archive, so this bridge must be validated against a source-backed
 * or authorized test client before the production flag is enabled.
 */
export async function handleSeCompat(request, env, requestId = crypto.randomUUID()) {
  if (env.FREZEN_SE_COMPAT_ENABLED !== "true") return reply({ error: "NOT_FOUND" }, 404, requestId);
  if (request.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405, requestId);

  const url = new URL(request.url);
  let body;
  try { body = await parseBody(request, url); }
  catch (error) {
    return reply({ error: error?.message === "MULTIPART_NOT_SUPPORTED" ? "UNSUPPORTED_CONTENT_TYPE" : "INVALID_JSON" }, 400, requestId);
  }

  const action = canonicalSeAction(body.action ?? body.operation ?? body.command ?? url.searchParams.get("action"));
  if (action === "status") {
    return reply({ success: true, status: "ok", server: "Frezen", features: ["license_keys", "hwid_management"], topup: "not_available" }, 200, requestId);
  }
  if (action === "topup" || action === "payment" || action === "purchase_subscription") {
    return reply({ success: false, error: "TOPUP_NOT_IMPLEMENTED", message: "Top-up is not available in Frezen yet." }, 501, requestId);
  }

  const required = requiredPermission(action);
  if (!required) return reply({ success: false, error: "UNSUPPORTED_ACTION", action: action || null }, 400, requestId);

  const identity = await authenticateApiKey(request, body, env);
  if (identity.error) return reply({ success: false, error: identity.error }, identity.status, requestId);
  if (!hasScope(identity.scopes, required.scope)) return reply({ success: false, error: "API_KEY_SCOPE_REQUIRED", required_scope: required.scope }, 403, requestId);
  if (!hasPermission(identity.auth.role, required.permission)) return reply({ success: false, error: "FORBIDDEN" }, 403, requestId);

  if (action === "generate_key") {
    const productId = String(body.product_id ?? body.productId ?? body.product ?? body.game_id ?? "").trim();
    if (!productId || productId.length > 128) return reply({ success: false, error: "PRODUCT_ID_REQUIRED" }, 400, requestId);
    const durationInput = body.duration_days ?? body.durationDays ?? body.days;
    const durationDays = durationInput == null || durationInput === "" ? null : Number(durationInput);
    const maxDevices = Number(body.max_devices ?? body.maxDevices ?? 1);
    if (durationDays != null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)) {
      return reply({ success: false, error: "INVALID_DURATION_DAYS" }, 400, requestId);
    }
    if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 100) {
      return reply({ success: false, error: "INVALID_MAX_DEVICES" }, 400, requestId);
    }

    const inner = new Request("https://frezen.internal/api/v1/licenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ product_id: productId, duration_days: durationDays, max_devices: maxDevices }),
    });
    const response = await generateLicense(inner, env, requestId, reply, identity.auth);
    const payload = await response.json().catch(() => ({}));
    return reply({
      ...payload,
      success: response.status >= 200 && response.status < 300,
      message: response.ok ? "Keys were created successfully" : String(payload.error ?? "KEY_GENERATION_FAILED"),
      data: payload,
    }, response.status, requestId);
  }

  if (action === "list_keys") {
    const inner = new Request("https://frezen.internal/api/v1/licenses", { method: "GET" });
    const response = await listLicenses(inner, env, requestId, reply);
    const payload = await response.json().catch(() => ({}));
    return reply({ ...payload, success: response.ok, data: payload }, response.status, requestId);
  }

  if (action === "list_hwid") {
    const licenseId = String(body.license_id ?? body.licenseId ?? "").trim();
    if (!licenseId || licenseId.length > 128) return reply({ success: false, error: "LICENSE_ID_REQUIRED" }, 400, requestId);
    const result = await listHwidV2(env, { ownerId: identity.auth.user_id, licenseId });
    if (!result.ok) {
      const status = result.reason === "DEVICE_NOT_FOUND" || result.reason === "LICENSE_NOT_FOUND" ? 404 : result.reason === "DATABASE_UNAVAILABLE" ? 503 : 400;
      return reply({ success: false, error: result.reason }, status, requestId);
    }
    return reply({ success: true, devices: result.devices, data: result.devices }, 200, requestId);
  }

  const deviceId = String(body.device_id ?? body.deviceId ?? body.hwid_device_id ?? "").trim();
  if (!deviceId || deviceId.length > 128) return reply({ success: false, error: "DEVICE_ID_REQUIRED" }, 400, requestId);
  const status = action === "ban_hwid" ? "blocked" : "active";
  const result = await setHwidStatusV2(env, { ownerId: identity.auth.user_id, deviceId, status });
  if (!result.ok) {
    const httpStatus = result.reason === "DEVICE_NOT_FOUND" || result.reason === "LICENSE_NOT_FOUND" ? 404 : result.reason === "DATABASE_UNAVAILABLE" ? 503 : 400;
    return reply({ success: false, error: result.reason }, httpStatus, requestId);
  }
  return reply({
    success: true,
    message: status === "blocked" ? "HWID banned successfully" : "HWID unbanned successfully",
    updated: true,
    device: result.device ?? { id: deviceId, status },
    data: result,
  }, 200, requestId);
}
