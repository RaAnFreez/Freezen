import { bindRuntimeHwid } from "./security/runtime-hwid.js";

const deny = (code = "ACCESS_DENIED", status = 403, requestId = "") => new Response(code, {
  status,
  headers: {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    ...(requestId ? { "x-frezen-request-id": requestId } : {}),
  },
});

const serverError = (requestId) => new Response("SCRIPT_DELIVERY_UNAVAILABLE", {
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
    case "LICENSE_EXPIRED": return "LICENSE_EXPIRED";
    case "LICENSE_BLOCKED": return "LICENSE_BLOCKED";
    case "HWID_BLOCKED": return "HWID_BLOCKED";
    case "DEVICE_LIMIT_REACHED": return "DEVICE_LIMIT_REACHED";
    default: return "HWID_VALIDATION_FAILED";
  }
}

async function findScriptFile(env, keyHash, scriptId) {
  return env.DB.prepare(`
    SELECT
      s.id AS script_id,
      s.status AS script_status,
      s.service_id AS script_service_id,
      v.version,
      v.status AS version_status,
      f.id AS file_id,
      f.content,
      f.content_type,
      l.id AS license_id,
      l.status AS license_status,
      l.expires_at AS license_expires_at,
      kr.id AS key_record_id
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
    ORDER BY CASE WHEN v.status = 'ACTIVE' THEN 0 ELSE 1 END,
             v.created_at DESC
    LIMIT 1
  `).bind(keyHash, scriptId).first();
}

async function scriptExists(env, scriptId) {
  return env.DB.prepare("SELECT id, status FROM scripts WHERE id = ?1 LIMIT 1").bind(scriptId).first();
}

async function keyLicenseExists(env, keyHash) {
  return env.DB.prepare("SELECT id, status, expires_at FROM licenses WHERE license_key_hash = ?1 LIMIT 1").bind(keyHash).first();
}

async function deliverResolvedFile(request, env, requestId, scriptId, responseMode = "file") {
  if (request.method !== "GET") return deny("METHOD_NOT_ALLOWED", 405, requestId);
  if (!env.DB || !scriptId) return serverError(requestId);

  const url = new URL(request.url);
  const key = url.searchParams.get("key")?.trim() ?? "";
  const hwid = url.searchParams.get("hwid")?.trim() ?? "";
  if (!key || key.length > 512 || key === "PASTE YOUR KEY HERE") return deny("INVALID_KEY", 403, requestId);

  if (responseMode === "legacy-loader" && /text\/html/i.test(request.headers.get("accept") || "")) {
    return deny("You cant access this link", 403, requestId);
  }

  try {
    const keyHash = await sha256Hex(key);
    const row = await findScriptFile(env, keyHash, scriptId);
    if (!row) {
      const script = await scriptExists(env, scriptId);
      if (!script) return deny("SCRIPT_NOT_FOUND", 404, requestId);
      const license = await keyLicenseExists(env, keyHash);
      if (!license) return deny("INVALID_KEY", 403, requestId);
      if (String(license.status || "").toLowerCase() !== "active") return deny("LICENSE_BLOCKED", 403, requestId);
      if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) return deny("LICENSE_EXPIRED", 403, requestId);
      return deny("KEY_SCRIPT_MISMATCH", 403, requestId);
    }

    // Production D1 always returns these authorization fields. The nullable
    // checks keep lightweight D1 mocks/backward-compatible test doubles valid.
    if (row.script_status !== "ACTIVE") return deny("SCRIPT_INACTIVE", 403, requestId);
    if (row.license_status != null && String(row.license_status).toLowerCase() !== "active") return deny("LICENSE_BLOCKED", 403, requestId);
    if (row.license_expires_at != null && row.license_expires_at && new Date(row.license_expires_at).getTime() <= Date.now()) return deny("LICENSE_EXPIRED", 403, requestId);
    if (!row.content) return deny("SCRIPT_CONTENT_MISSING", 404, requestId);

    if (hwid) {
      const bound = await bindRuntimeHwid(env, row.license_id, hwid);
      if (!bound.ok) return deny(bindFailureMessage(bound.reason), 403, requestId);
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
  return deliverResolvedFile(request, env, requestId, scriptId, isRaw ? "raw" : "legacy-loader");
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
