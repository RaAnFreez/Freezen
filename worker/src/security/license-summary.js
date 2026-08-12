export async function getUserLicenseSummary(request, env, requestId, json, externalId) {
  if (!env.DB) {
    return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  }

  if (!externalId || externalId.length > 128) {
    return json({ error: "INVALID_EXTERNAL_ID", request_id: requestId }, 400, requestId);
  }

  try {
    const user = await env.DB
      .prepare("SELECT id, external_id, display_name FROM users WHERE external_id = ?1 LIMIT 1")
      .bind(externalId)
      .first();

    if (!user) {
      return json({ error: "USER_NOT_FOUND", request_id: requestId }, 404, requestId);
    }

    const result = await env.DB
      .prepare("SELECT id, status, expires_at, created_at, updated_at FROM licenses WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100")
      .bind(user.id)
      .all();

    return json({
      user: {
        id: user.id,
        external_id: user.external_id,
        display_name: user.display_name,
      },
      licenses: result?.results ?? [],
      request_id: requestId,
    }, 200, requestId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}
