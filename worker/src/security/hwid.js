import { requireAuth } from "./auth.js";
import { bindHwidV2, validateHwidV2, listHwidV2, resetHwidV2, setHwidStatusV2 } from "./hwid-v2.js";

const json = (body, status = 200, requestId = crypto.randomUUID()) => new Response(JSON.stringify({ ...body, request_id: requestId }), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const readJson = async (request, requestId) => {
  try { return await request.json(); }
  catch { return json({ error: "INVALID_JSON" }, 400, requestId); }
};

const resolveAuth = async (request, env, requestId, auth) => auth ?? await requireAuth(request, env, requestId);

function statusCode(reason, fallback = 400) {
  if (["LICENSE_BLOCKED", "LICENSE_EXPIRED", "HWID_BLOCKED", "LICENSE_OWNERSHIP_REQUIRED"].includes(reason)) return 403;
  if (reason === "LICENSE_NOT_FOUND" || reason === "DEVICE_NOT_FOUND") return 404;
  if (reason === "DEVICE_LIMIT_REACHED") return 409;
  if (reason === "DATABASE_UNAVAILABLE" || reason === "DATABASE_ERROR") return 503;
  return fallback;
}

export async function listHwid(request, env, requestId) {
  const auth = await resolveAuth(request, env, requestId, null);
  if (auth instanceof Response) return auth;
  const licenseId = new URL(request.url).searchParams.get("license_id") || "";
  const result = await listHwidV2(env, { ownerId: auth.user_id, licenseId });
  if (!result.ok) return json({ error: result.reason }, statusCode(result.reason, 400), requestId);
  return json({ devices: result.devices }, 200, requestId);
}

export async function bindHwid(request, env, requestId, _json, auth) {
  if (!auth?.user_id) return json({ error: "SESSION_AUTH_REQUIRED" }, 401, requestId);
  const body = await readJson(request, requestId);
  if (body instanceof Response) return body;
  const result = await bindHwidV2(env, { licenseId: body?.license_id, ownerId: auth.user_id, rawHwid: body?.hwid });
  if (!result.ok) return json({ error: result.reason }, statusCode(result.reason, 400), requestId);
  return json({ bound: true, existing: Boolean(result.existing), device_id: result.deviceId, fingerprint: result.fingerprint }, result.existing ? 200 : 201, requestId);
}

export async function validateHwid(request, env, requestId, _json, auth) {
  if (!auth?.user_id) return json({ error: "SESSION_AUTH_REQUIRED" }, 401, requestId);
  const body = await readJson(request, requestId);
  if (body instanceof Response) return body;
  const result = await validateHwidV2(env, { licenseId: body?.license_id, ownerId: auth.user_id, rawHwid: body?.hwid });
  if (!result.ok) {
    if (result.reason === "HWID_MISMATCH") return json({ valid: false, reason: result.reason }, 200, requestId);
    return json({ valid: false, reason: result.reason }, statusCode(result.reason, 403), requestId);
  }
  return json({ valid: true, device_id: result.deviceId, fingerprint: result.fingerprint }, 200, requestId);
}

export async function resetHwid(request, env, requestId, _json, licenseId, auth = null) {
  const resolved = await resolveAuth(request, env, requestId, auth);
  if (resolved instanceof Response) return resolved;
  const result = await resetHwidV2(env, { ownerId: resolved.user_id, licenseId });
  if (!result.ok) return json({ error: result.reason }, statusCode(result.reason, 409), requestId);
  return json({ reset: true, reset_at: result.resetAt }, 200, requestId);
}

export async function blockHwid(request, env, requestId, _json, deviceId, auth = null) {
  const resolved = await resolveAuth(request, env, requestId, auth);
  if (resolved instanceof Response) return resolved;
  const result = await setHwidStatusV2(env, { ownerId: resolved.user_id, deviceId, status: "blocked" });
  if (!result.ok) return json({ error: result.reason }, statusCode(result.reason, 400), requestId);
  return json({ updated: true, device: { id: deviceId, status: "blocked" } }, 200, requestId);
}

export async function unblockHwid(request, env, requestId, _json, deviceId, auth = null) {
  const resolved = await resolveAuth(request, env, requestId, auth);
  if (resolved instanceof Response) return resolved;
  const result = await setHwidStatusV2(env, { ownerId: resolved.user_id, deviceId, status: "active" });
  if (!result.ok) return json({ error: result.reason }, statusCode(result.reason, 400), requestId);
  return json({ updated: true, device: { id: deviceId, status: "active" } }, 200, requestId);
}
