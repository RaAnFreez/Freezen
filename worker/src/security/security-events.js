const MAX_METADATA = 2048;

export async function recordSecurityEvent(env, event = {}) {
  if (!env.DB) return false;
  try {
    const metadata = event.metadata == null ? null : JSON.stringify(event.metadata).slice(0, MAX_METADATA);
    await env.DB.prepare(`INSERT INTO security_events
      (id, event_type, severity, user_id, action, resource_type, resource_id, request_id, metadata_json)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
      .bind(
        crypto.randomUUID(),
        String(event.event_type || 'system').slice(0, 64),
        String(event.severity || 'info').slice(0, 16),
        event.user_id || null,
        event.action ? String(event.action).slice(0, 128) : null,
        event.resource_type ? String(event.resource_type).slice(0, 64) : null,
        event.resource_id ? String(event.resource_id).slice(0, 128) : null,
        event.request_id || null,
        metadata,
      ).run();
    return true;
  } catch {
    return false;
  }
}

export async function getSecurityEvents(request, env, requestId, json) {
  if (!env.DB) return json({ error: 'DATABASE_UNAVAILABLE', request_id: requestId }, 503, requestId);
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));
  try {
    const result = await env.DB.prepare(`SELECT id, event_type, severity, user_id, action, resource_type,
      resource_id, request_id, metadata_json, created_at
      FROM security_events ORDER BY created_at DESC LIMIT ?1`).bind(limit).all();
    return json({ events: (result?.results || []).map((row) => ({
      id: row.id, event_type: row.event_type, severity: row.severity,
      user_id: row.user_id, action: row.action, resource_type: row.resource_type,
      resource_id: row.resource_id, request_id: row.request_id, created_at: row.created_at,
    })), request_id: requestId }, 200, requestId);
  } catch {
    return json({ error: 'DATABASE_ERROR', request_id: requestId }, 503, requestId);
  }
}

export async function getAuditEvents(request, env, requestId, json) {
  if (!env.DB) return json({ error: 'DATABASE_UNAVAILABLE', request_id: requestId }, 503, requestId);
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));
  try {
    const [security, license] = await Promise.all([
      env.DB.prepare(`SELECT id, event_type AS action, severity, user_id, resource_type, resource_id, request_id, created_at
        FROM security_events ORDER BY created_at DESC LIMIT ?1`).bind(limit).all(),
      env.DB.prepare(`SELECT id, license_id AS resource_id, previous_status, new_status, changed_at AS created_at
        FROM license_audit_log ORDER BY changed_at DESC LIMIT ?1`).bind(limit).all(),
    ]);
    const events = [
      ...(security?.results || []).map((row) => ({ ...row, source: 'security' })),
      ...(license?.results || []).map((row) => ({ ...row, action: 'license.status_changed', source: 'license', severity: 'info' })),
    ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit);
    return json({ events, request_id: requestId }, 200, requestId);
  } catch {
    return json({ error: 'DATABASE_ERROR', request_id: requestId }, 503, requestId);
  }
}
