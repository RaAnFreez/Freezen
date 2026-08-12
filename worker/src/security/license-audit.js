export async function getLicenseAudit(request, env, requestId, json, licenseId) {
  if (!env.DB) {
    return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  }

  if (!licenseId || licenseId.length > 128) {
    return json({ error: "INVALID_LICENSE_ID", request_id: requestId }, 400, requestId);
  }

  try {
    const license = await env.DB
      .prepare("SELECT id FROM licenses WHERE id = ?1 LIMIT 1")
      .bind(licenseId)
      .first();

    if (!license) {
      return json({ error: "LICENSE_NOT_FOUND", request_id: requestId }, 404, requestId);
    }

    const result = await env.DB
      .prepare("SELECT id, license_id, previous_status, new_status, changed_at FROM license_audit_log WHERE license_id = ?1 ORDER BY changed_at DESC LIMIT 100")
      .bind(licenseId)
      .all();

    return json({
      audit: (result?.results ?? []).map((entry) => ({
        id: entry.id,
        license_id: entry.license_id,
        previous_status: entry.previous_status,
        new_status: entry.new_status,
        changed_at: entry.changed_at,
      })),
      request_id: requestId,
    }, 200, requestId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}
