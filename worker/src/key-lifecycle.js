const json = (body, status = 200, requestId = crypto.randomUUID()) => new Response(JSON.stringify({ ...body, request_id: requestId }), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function deleteKey(request, env, requestId, auth, keyId) {
  if (!env?.DB || !auth?.user_id) return json({ error: "SESSION_AUTH_REQUIRED" }, 401, requestId);
  const id = String(keyId ?? "").trim();
  if (!id || id.length > 128) return json({ error: "INVALID_KEY_ID" }, 400, requestId);

  try {
    const key = await env.DB.prepare(
      "SELECT id, license_id FROM frezen_key_records WHERE id = ?1 AND owner_id = ?2 LIMIT 1",
    ).bind(id, auth.user_id).first();
    if (!key) return json({ error: "KEY_NOT_FOUND" }, 404, requestId);

    await env.DB.batch([
      env.DB.prepare("DELETE FROM frezen_key_limits WHERE key_id = ?1").bind(id),
      env.DB.prepare("DELETE FROM frezen_key_records WHERE id = ?1 AND owner_id = ?2").bind(id, auth.user_id),
    ]);

    return json({ deleted: true, key_id: id, license_id: key.license_id }, 200, requestId);
  } catch (error) {
    console.error("key delete failed", { requestId, keyId: id, message: String(error?.message ?? error) });
    return json({ error: "DATABASE_ERROR" }, 503, requestId);
  }
}

export async function cleanupExpiredKeys(env, ownerId = null) {
  if (!env?.DB) return { removed: 0 };
  try {
    const ownerClause = ownerId ? " AND kr.owner_id = ?1" : "";
    const bindings = ownerId ? [ownerId] : [];
    const expired = await env.DB.prepare(`
      SELECT kr.id
      FROM frezen_key_records kr
      JOIN licenses l ON l.id = kr.license_id
      WHERE l.expires_at IS NOT NULL
        AND datetime(l.expires_at) <= datetime('now')${ownerClause}
    `).bind(...bindings).all();

    const ids = (expired.results ?? []).map((row) => row.id).filter(Boolean);
    if (!ids.length) return { removed: 0 };

    const statements = [];
    for (const id of ids) {
      statements.push(env.DB.prepare("DELETE FROM frezen_key_limits WHERE key_id = ?1").bind(id));
      statements.push(env.DB.prepare("DELETE FROM frezen_key_records WHERE id = ?1").bind(id));
    }
    await env.DB.batch(statements);
    return { removed: ids.length };
  } catch (error) {
    console.error("expired key cleanup failed", { message: String(error?.message ?? error) });
    return { removed: 0, error: "DATABASE_ERROR" };
  }
}
