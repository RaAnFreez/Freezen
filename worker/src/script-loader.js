const deny = (message = 'You cant access this link') => new Response(message, {
  status: 403,
  headers: {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate',
    'pragma': 'no-cache',
    'x-content-type-options': 'nosniff',
  },
});

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function deliverScriptByKey(request, env, requestId, scriptId) {
  if (request.method !== 'GET') return deny('You cant access this link');
  if (!env.DB || !scriptId) return deny();

  const key = new URL(request.url).searchParams.get('key')?.trim() ?? '';
  if (!key || key.length > 512 || key === 'PASTE YOUR KEY HERE') return deny();

  try {
    const keyHash = await sha256Hex(key);
    const row = await env.DB.prepare(`
      SELECT
        s.id AS script_id,
        s.status AS script_status,
        v.version,
        v.status AS version_status,
        f.content,
        f.content_type
      FROM scripts s
      JOIN script_versions v
        ON v.script_id = s.id
       AND v.status = 'ACTIVE'
      JOIN script_files f
        ON f.script_version_id = v.id
      JOIN frezen_key_records kr
        ON kr.service_id = s.service_id
      JOIN licenses l
        ON l.id = kr.license_id
       AND l.license_key_hash = ?1
      WHERE s.id = ?2
        AND s.status = 'ACTIVE'
        AND LOWER(COALESCE(l.status, '')) = 'active'
        AND (l.expires_at IS NULL OR datetime(l.expires_at) > datetime('now'))
      ORDER BY v.created_at DESC
      LIMIT 1
    `).bind(keyHash, scriptId).first();

    if (!row || row.script_status !== 'ACTIVE' || row.version_status !== 'ACTIVE') return deny();

    return new Response(row.content, {
      status: 200,
      headers: {
        'content-type': row.content_type || 'text/x-lua; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'pragma': 'no-cache',
        'x-content-type-options': 'nosniff',
        'x-frezen-request-id': requestId,
        'x-frezen-version': row.version,
      },
    });
  } catch {
    return deny();
  }
}

export function buildInternalLoaderUrl(request, scriptId) {
  return `${new URL(request.url).origin}/loader/${encodeURIComponent(scriptId)}`;
}

export function buildLoaderSource(request, scriptId) {
  const endpoint = buildInternalLoaderUrl(request, scriptId);
  return [
    'script_key="PASTE YOUR KEY HERE";',
    'local HttpService=game:GetService("HttpService");',
    `local source=game:HttpGet("${endpoint}?key="..HttpService:UrlEncode(script_key));`,
    'loadstring(source)();',
  ].join('\n');
}
