import { bindRuntimeHwid } from "./security/runtime-hwid.js";

const deny = (message = "You cant access this link") => new Response(message, {
  status: 403,
  headers: {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
  },
});

const serverError = (requestId) => new Response("Script delivery temporarily unavailable", {
  status: 503,
  headers: {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-frezen-request-id": requestId,
  },
});

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bindFailureMessage(reason) {
  switch (reason) {
    case "LICENSE_EXPIRED": return "License expired";
    case "LICENSE_BLOCKED": return "License blocked";
    case "HWID_BLOCKED": return "HWID blocked";
    case "DEVICE_LIMIT_REACHED": return "Device limit reached";
    default: return "HWID validation failed";
  }
}

async function findScriptFile(env, keyHash, scriptId) {
  return env.DB.prepare(`
    SELECT
      s.id AS script_id,
      s.status AS script_status,
      v.version,
      v.status AS version_status,
      f.id AS file_id,
      f.content,
      f.content_type,
      l.id AS license_id
    FROM scripts s
    JOIN script_versions v
      ON v.id = (
        SELECT v2.id
        FROM script_versions v2
        WHERE v2.script_id = s.id
          AND v2.status IN ('ACTIVE', 'ARCHIVED')
        ORDER BY CASE WHEN v2.status = 'ACTIVE' THEN 0 ELSE 1 END,
                 v2.created_at DESC
        LIMIT 1
      )
    JOIN script_files f
      ON f.script_version_id = v.id
    JOIN frezen_key_records kr
      ON kr.service_id = s.service_id
      OR kr.provider_id IN (
        SELECT p.id
        FROM frezen_key_providers p
        WHERE p.service_id = s.service_id
      )
    JOIN licenses l
      ON l.id = kr.license_id
     AND l.license_key_hash = ?1
    WHERE s.id = ?2
      AND s.status = 'ACTIVE'
      AND LOWER(COALESCE(l.status, '')) = 'active'
      AND (l.expires_at IS NULL OR datetime(l.expires_at) > datetime('now'))
      AND (l.user_id IS NULL OR l.user_id = kr.owner_id)
    ORDER BY CASE WHEN v.status = 'ACTIVE' THEN 0 ELSE 1 END,
             v.created_at DESC
    LIMIT 1
  `).bind(keyHash, scriptId).first();
}

async function deliverResolvedFile(request, env, requestId, scriptId, responseMode = "file") {
  if (request.method !== "GET") return deny();
  if (!env.DB || !scriptId) return serverError(requestId);

  const url = new URL(request.url);
  const key = url.searchParams.get("key")?.trim() ?? "";
  const hwid = url.searchParams.get("hwid")?.trim() ?? "";
  if (!key || key.length > 512 || key === "PASTE YOUR KEY HERE") return deny();

  try {
    const keyHash = await sha256Hex(key);
    const row = await findScriptFile(env, keyHash, scriptId);
    if (!row || row.script_status !== "ACTIVE") return deny();

    if (hwid) {
      const bound = await bindRuntimeHwid(env, row.license_id, hwid);
      if (!bound.ok) return deny(bindFailureMessage(bound.reason));
    }

    return new Response(row.content, {
      status: 200,
      headers: {
        "content-type": row.content_type || "text/x-lua; charset=utf-8",
        "content-disposition": responseMode === "file" ? `inline; filename="${encodeURIComponent(row.script_id)}.lua"` : "inline",
        "cache-control": "no-store, no-cache, must-revalidate",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
        "x-frezen-request-id": requestId,
        "x-frezen-file-id": row.file_id || row.script_id,
        "x-frezen-version": row.version,
      },
    });
  } catch (error) {
    console.error("script file delivery failed", {
      requestId,
      scriptId,
      message: String(error?.message ?? error),
    });
    return serverError(requestId);
  }
}

export async function deliverScriptByKey(request, env, requestId, scriptId) {
  const url = new URL(request.url);
  const isRaw = url.searchParams.get("format") === "raw";
  if (!isRaw) return deny();
  return deliverResolvedFile(request, env, requestId, scriptId, "raw");
}

export async function deliverScriptFileByKey(request, env, requestId, fileOrScriptId) {
  return deliverResolvedFile(request, env, requestId, fileOrScriptId, "file");
}

export function buildInternalLoaderUrl(request, scriptId) {
  return `${new URL(request.url).origin}/files/${encodeURIComponent(scriptId)}.lua`;
}

export function buildLoaderSource(request, scriptId) {
  const endpoint = buildInternalLoaderUrl(request, scriptId);
  return [
    'script_key="PASTE YOUR KEY HERE";',
    'local HttpService=game:GetService("HttpService");',
    'local ok,hwid=pcall(function() return game:GetService("RbxAnalyticsService"):GetClientId() end);',
    'if not ok then hwid="" end;',
    `local source=game:HttpGet("${endpoint}?key="..HttpService:UrlEncode(script_key).."&hwid="..HttpService:UrlEncode(hwid));`,
    'loadstring(source)();',
  ].join("\n");
}
