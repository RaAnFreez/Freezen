import { listHwidV2, setHwidStatusV2 } from "./security/hwid-v2.js";
import { hydrateRobloxUsernames } from "./roblox-user.js";

const json = (body, status = 200, requestId = crypto.randomUUID()) => new Response(JSON.stringify({ ...body, request_id: requestId }), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function identityStatus(device) {
  const username = String(device?.game_username ?? "").trim();
  const userId = String(device?.game_user_id ?? "").trim();
  if (username && userId) return "COMPLETE";
  if (username || userId) return "PARTIAL";
  return "NOT_RECEIVED";
}

export async function listAllHwid(env, requestId, auth) {
  const result = await listHwidV2(env, { ownerId: auth?.user_id });
  if (!result.ok) {
    const status = result.reason === "SESSION_AUTH_REQUIRED" ? 401 : 503;
    return json({ error: result.reason }, status, requestId);
  }
  const devices = await hydrateRobloxUsernames(env, result.devices ?? []);
  const enriched = devices.map((device) => ({ ...device, identity_status: identityStatus(device) }));
  const blocked = enriched.filter((device) => device.status === "blocked").length;
  const identity = {
    total: enriched.length,
    complete: enriched.filter((device) => device.identity_status === "COMPLETE").length,
    partial: enriched.filter((device) => device.identity_status === "PARTIAL").length,
    not_received: enriched.filter((device) => device.identity_status === "NOT_RECEIVED").length,
  };
  return json({ devices: enriched, stats: { total: enriched.length, active: enriched.length - blocked, blocked, identity } }, 200, requestId);
}

export async function setHwidAdminStatus(env, requestId, auth, deviceId, status) {
  const result = await setHwidStatusV2(env, { ownerId: auth?.user_id, deviceId, status });
  if (!result.ok) {
    const statusCode = result.reason === "SESSION_AUTH_REQUIRED" ? 401 : result.reason === "DEVICE_NOT_FOUND" ? 404 : 503;
    return json({ error: result.reason }, statusCode, requestId);
  }
  return json({ updated: true, status: result.status }, 200, requestId);
}
