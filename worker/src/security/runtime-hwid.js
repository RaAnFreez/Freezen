import { bindHwidV2, validateHwidV2, cleanupHwidV2 } from "./hwid-v2.js";

export async function bindRuntimeHwid(env, licenseId, ownerId, rawHwid) {
  const result = await bindHwidV2(env, { licenseId, ownerId, rawHwid });
  return {
    ok: result.ok,
    reason: result.reason,
    existing: result.existing,
    device_id: result.deviceId,
    fingerprint: result.fingerprint,
  };
}

export async function validateRuntimeHwid(env, licenseId, ownerId, rawHwid) {
  const result = await validateHwidV2(env, { licenseId, ownerId, rawHwid });
  return {
    ok: result.ok,
    reason: result.reason,
    device_id: result.deviceId,
    fingerprint: result.fingerprint,
  };
}

export { cleanupHwidV2 };
