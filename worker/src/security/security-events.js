const MAX_METADATA = 2048;
const normalizeSeverity = (value) => ['INFO', 'WARNING', 'CRITICAL'].includes(String(value).toUpperCase()) ? String(value).toUpperCase() : 'INFO';

export async function recordSecurityEvent(env, event = {}) {
  if (!env.DB) return false;
  try {
    const metadata = event.metadata == null ? null : JSON.stringify(event.metadata).slice(0, MAX_METADATA);
    await env.DB.prepare(`INSERT INTO security_events
      (id, user_id, event_type, severity, request_id, metadata_json)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(
        crypto.randomUUID(),
        event.user_id || null,
        String(event.event_type || 'SYSTEM').slice(0, 64),
        normalizeSeverity(event.severity),
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
    const result = await env.DB.prepare(`SELECT id, event_type, severity, user_id, request_id, metadata_json, created_at
      FROM security_events ORDER BY created_at DESC LIMIT ?1`).bind(limit).all();
    return json({ events: (result?.results || []).map((row) => ({
      id: row.id, event_type: row.event_type, severity: row.severity,
      user_id: row.user_id, request_id: row.request_id, created_at: row.created_at,
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
    const [audit, license] = await Promise.all([
      env.DB.prepare(`SELECT id, user_id, action, resource_type, resource_id, status, request_id, created_at
        FROM audit_logs ORDER BY created_at DESC LIMIT ?1`).bind(limit).all(),
      env.DB.prepare(`SELECT id, license_id AS resource_id, previous_status, new_status, changed_at AS created_at
        FROM license_audit_log ORDER BY changed_at DESC LIMIT ?1`).bind(limit).all(),
    ]);
    const events = [
      ...(audit?.results || []).map((row) => ({ ...row, source: 'audit', severity: row.status === 'FAILED' ? 'WARNING' : 'INFO' })),
      ...(license?.results || []).map((row) => ({ ...row, action: 'LICENSE_STATUS_CHANGED', source: 'license', severity: 'INFO' })),
    ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit);
    return json({ events, request_id: requestId }, 200, requestId);
  } catch {
    return json({ error: 'DATABASE_ERROR', request_id: requestId }, 503, requestId);
  }
}
