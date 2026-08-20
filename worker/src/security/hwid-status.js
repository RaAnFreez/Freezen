import { setHwidStatusV2, resetHwidV2 } from "./hwid-v2.js";

export async function setRuntimeHwidStatus(env, { ownerId, deviceId, status }) {
  return setHwidStatusV2(env, { ownerId, deviceId, status });
}

export async function resetRuntimeHwid(env, { ownerId, licenseId }) {
  return resetHwidV2(env, { ownerId, licenseId });
}
