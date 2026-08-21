import { listHwidV2, setHwidStatusV2 } from "./security/hwid-v2.js";
import { hydrateRobloxUsernames } from "./roblox-user.js";

const json = (body, status = 200, requestId = crypto.randomUUID()) => new Response(JSON.stringify({ ...body, request_id: requestId }), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function listAllHwid(env, requestId, auth) {
  const result = await listHwidV2(env, { ownerId: auth?.user_id });
  if (!result.ok) {
    const status = result.reason === "SESSION_AUTH_REQUIRED" ? 401 : 503;
    return json({ error: result.reason }, status, requestId);
  }
  const devices = await hydrateRobloxUsernames(result.devices ?? []);
  const blocked = devices.filter((device) => device.status === "blocked").length;
  return json({ devices, stats: { total: devices.length, active: devices.length - blocked, blocked } }, 200, requestId);
}

export async function setHwidAdminStatus(env, requestId, auth, deviceId, status) {
  const result = await setHwidStatusV2(env, { ownerId: auth?.user_id, deviceId, status });
  if (!result.ok) {
    const statusCode = result.reason === "SESSION_AUTH_REQUIRED" ? 401 : result.reason === "DEVICE_NOT_FOUND" ? 404 : 503;
    return json({ error: result.reason }, statusCode, requestId);
  }
  return json({ updated: true, status: result.status }, 200, requestId);
}
