const json = (body, status = 200, requestId = crypto.randomUUID()) => new Response(JSON.stringify({ ...body, request_id: requestId }), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function listAllHwid(env, requestId, auth) {
  if (!env?.DB || !auth?.user_id) return json({ error: "SESSION_AUTH_REQUIRED" }, 401, requestId);
  try {
    const rows = await env.DB.prepare(`
      SELECT
        d.id,
        d.license_id,
        d.status,
        d.first_seen,
        d.last_seen,
        d.blocked_at,
        d.blocked_reason,
        d.created_at,
        d.updated_at,
        l.expires_at,
        kr.key_name,
        kr.service_id,
        s.name AS service_name,
        substr(d.hwid_hash, 1, 12) AS fingerprint
      FROM devices d
      JOIN licenses l ON l.id = d.license_id
      JOIN frezen_key_records kr ON kr.license_id = l.id
      LEFT JOIN frezen_key_services s ON s.id = kr.service_id
      WHERE kr.owner_id = ?1
      ORDER BY CASE WHEN d.status = 'blocked' THEN 0 ELSE 1 END, d.last_seen DESC
      LIMIT 500
    `).bind(auth.user_id).all();

    const devices = rows.results ?? [];
    const blocked = devices.filter((device) => device.status === "blocked").length;
    return json({ devices, stats: { total: devices.length, active: devices.length - blocked, blocked }, request_id: requestId }, 200, requestId);
  } catch (error) {
    console.error("HWID dashboard listing failed", { requestId, message: String(error?.message ?? error) });
    return json({ error: "DATABASE_ERROR" }, 503, requestId);
  }
}
