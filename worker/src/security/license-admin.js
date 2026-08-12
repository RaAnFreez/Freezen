export async function updateLicenseStatus(request, env, requestId, json, licenseId) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  if (!licenseId || licenseId.length > 128) return json({ error: "INVALID_LICENSE_ID", request_id: requestId }, 400, requestId);

  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }

  const status = typeof body?.status === "string" ? body.status.trim().toLowerCase() : "";
  if (!["active", "revoked", "banned"].includes(status)) return json({ error: "INVALID_LICENSE_STATUS", request_id: requestId }, 400, requestId);

  try {
    const current = await env.DB.prepare("SELECT status FROM licenses WHERE id = ?1 LIMIT 1").bind(licenseId).first();
    if (!current) return json({ error: "LICENSE_NOT_FOUND", request_id: requestId }, 404, requestId);

    const result = await env.DB.prepare("UPDATE licenses SET status = ?1 WHERE id = ?2").bind(status, licenseId).run();
    if (!result?.meta || result.meta.changes !== 1) return json({ error: "LICENSE_NOT_FOUND", request_id: requestId }, 404, requestId);

    await env.DB.prepare(
      "INSERT INTO license_audit_log (id, license_id, previous_status, new_status) VALUES (?1, ?2, ?3, ?4)",
    ).bind(crypto.randomUUID(), licenseId, current.status, status).run();

    return json({ updated: true, license: { id: licenseId, status }, request_id: requestId }, 200, requestId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}
