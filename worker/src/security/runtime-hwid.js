const encoder = new TextEncoder();
const MAX_HWID_LENGTH = 512;

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function bindRuntimeHwid(env, licenseId, rawHwid) {
  const hwid = typeof rawHwid === "string" ? rawHwid.trim() : "";
  const id = typeof licenseId === "string" ? licenseId.trim() : "";
  if (!env?.DB || !id || !hwid || hwid.length > MAX_HWID_LENGTH) return { ok: false, reason: "INVALID_HWID" };

  try {
    const row = await env.DB.prepare(`
      SELECT l.id AS license_id, l.status, l.expires_at, kr.owner_id,
             COALESCE(kl.max_devices, 1) AS max_devices
      FROM licenses l
      JOIN frezen_key_records kr ON kr.license_id = l.id
      LEFT JOIN frezen_key_limits kl ON kl.key_id = kr.id
      WHERE l.id = ?1
      LIMIT 1
    `).bind(id).first();

    if (!row) return { ok: false, reason: "LICENSE_NOT_FOUND" };
    if (["revoked", "banned"].includes(String(row.status ?? "").toLowerCase())) return { ok: false, reason: "LICENSE_BLOCKED" };
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: "LICENSE_EXPIRED" };

    const hwidHash = await sha256Hex(hwid);
    const existing = await env.DB.prepare(
      "SELECT id, status FROM devices WHERE license_id = ?1 AND hwid_hash = ?2 LIMIT 1",
    ).bind(id, hwidHash).first();

    if (existing) {
      if (existing.status === "blocked") return { ok: false, reason: "HWID_BLOCKED" };
      await env.DB.prepare("UPDATE devices SET last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(existing.id).run();
      await env.DB.prepare("UPDATE licenses SET current_hwid = ?1, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?2").bind(hwidHash, id).run();
      return { ok: true, existing: true, device_id: existing.id };
    }

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM devices WHERE license_id = ?1 AND status = 'active'",
    ).bind(id).first();
    if (Number(count?.total ?? 0) >= Number(row.max_devices ?? 1)) return { ok: false, reason: "DEVICE_LIMIT_REACHED" };

    const deviceId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO devices (id, license_id, user_id, hwid_hash, status) VALUES (?1, ?2, ?3, ?4, 'active')",
    ).bind(deviceId, id, row.owner_id, hwidHash).run();
    await env.DB.prepare(
      "UPDATE licenses SET current_hwid = ?1, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
    ).bind(hwidHash, id).run();
    return { ok: true, existing: false, device_id: deviceId };
  } catch (error) {
    console.error("runtime HWID bind failed", { licenseId: id, message: String(error?.message ?? error) });
    return { ok: false, reason: "DATABASE_ERROR" };
  }
}
