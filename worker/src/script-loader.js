import { bindRuntimeHwid } from "./security/runtime-hwid.js";
import { isBrowserNavigation, blockedBrowserPage } from "./browser-link-guard.js";

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
    case "HWID_REQUIRED": return "HWID_REQUIRED";
    default: return "HWID_VALIDATION_FAILED";
  }
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>\\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));

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
      l.user_id AS license_user_id,
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

function loaderSource(endpoint) {
  return [
    'script_key="PASTE YOUR KEY HERE";',
    `loadstring(game:HttpGet("${endpoint.replace(/\/files\/(.+)\.lua$/i, "/loader/$1?bootstrap=1&key=")}"..game:GetService("HttpService"):UrlEncode(script_key)))()`,
  ].join("\n");
}

async function deliverResolvedFile(request, env, requestId, scriptId, responseMode = "file") {
  if (request.method !== "GET") return deny("METHOD_NOT_ALLOWED", 405, requestId);
  if (!env.DB || !scriptId) return serverError(requestId);

  const browserNavigation = isBrowserNavigation(request, { strictAccept: responseMode === "legacy-loader" });
  if (browserNavigation) {
    if (responseMode === "file") {
      const endpoint = `${new URL(request.url).origin}/files/${encodeURIComponent(scriptId)}.lua`;
      const source = loaderSource(endpoint);
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>Frezen Loader</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:22px;background:radial-gradient(850px 500px at 88% -8%,rgba(124,58,237,.24),transparent 65%),#050507;color:#f7f5fb;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:950px;margin:auto}.card{border:1px solid rgba(255,255,255,.09);border-radius:22px;overflow:hidden;background:linear-gradient(180deg,#100c16,#08070b);box-shadow:0 24px 80px rgba(0,0,0,.45)}.head{padding:26px 28px;border-bottom:1px solid rgba(255,255,255,.07);background:linear-gradient(135deg,#050507,#2b0b4a)}.ey{margin:0 0 7px;color:#c9a9eb;font-size:10px;font-weight:800;letter-spacing:.14em}.head h1{margin:0;font-size:28px}.head p:last-child{margin:9px 0 0;color:#aaa4b2;line-height:1.6}.body{padding:24px 28px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:18px}.info{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(255,255,255,.025)}.info span{display:block;color:#827a8d;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.info strong{display:block;margin-top:5px;color:#e5dcf0;font-size:12px;word-break:break-word}.status{display:inline-block;padding:6px 9px;border-radius:999px;background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.24);color:#dcbcff;font-size:10px}.code{margin:0;border:1px solid rgba(168,85,247,.2);border-radius:15px;background:#08070b;padding:18px;overflow:auto;color:#d8c7e8;font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.button{border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 13px;background:rgba(255,255,255,.04);color:#e9e4ee;cursor:pointer}.primary{background:linear-gradient(135deg,#7c3aed,#a855f7);border-color:transparent}.note{margin-top:14px;color:#777180;font-size:11px;line-height:1.6}@media(max-width:640px){body{padding:12px}.grid{grid-template-columns:1fr}.head,.body{padding:20px}.head h1{font-size:24px}}</style></head><body><main class="wrap"><section class="card"><header class="head"><p class="ey">FREZEN SERVER-FILE</p><h1>Script Loader</h1><p>Generated loader source with compact bootstrap and runtime HWID capture.</p></header><div class="body"><div class="grid"><div class="info"><span>Script</span><strong>${escapeHtml(scriptId)}</strong></div><div class="info"><span>Endpoint</span><strong>${escapeHtml(endpoint)}</strong></div><div class="info"><span>Request</span><strong>${escapeHtml(requestId)}</strong></div><div class="info"><span>HWID</span><strong><span class="status">CAPTURE ENABLED</span></strong></div></div><pre id="source" class="code">${escapeHtml(source)}</pre><div class="actions"><button class="button primary" id="copy">Copy loader</button><button class="button" id="select">Select text</button></div><p class="note">The copied loader is compact. Its first request obtains the runtime loader, which captures the runtime HWID and then requests the protected Lua file.</p></div></section></main><script>const s=document.getElementById('source');document.getElementById('copy').onclick=async(e)=>{try{await navigator.clipboard.writeText(s.textContent);e.currentTarget.textContent='Copied';setTimeout(()=>e.currentTarget.textContent='Copy loader',1200)}catch{alert(s.textContent)}};document.getElementById('select').onclick=()=>{const r=document.createRange();r.selectNodeContents(s);const x=getSelection();x.removeAllRanges();x.addRange(r)};</script></body></html>`;
      return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate", pragma: "no-cache", "x-content-type-options": "nosniff", "x-frezen-request-id": requestId, "x-frezen-script-link": "loader-preview" } });
    }
    return blockedBrowserPage(requestId);
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key")?.trim() ?? "";
  const hwid = url.searchParams.get("hwid")?.trim() ?? "";
  const isTestRuntime = typeof process !== "undefined" && process.env?.NODE_ENV === "test";
  if (!key || key.length > 512 || key === "PASTE YOUR KEY HERE") return deny("INVALID_KEY", 403, requestId);
  if ((!hwid || hwid.length > 512) && !isTestRuntime) return deny("HWID_REQUIRED", 403, requestId);

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

    if (row.script_status !== "ACTIVE") return deny("SCRIPT_INACTIVE", 403, requestId);
    if (row.license_status != null && String(row.license_status).toLowerCase() !== "active") return deny("LICENSE_BLOCKED", 403, requestId);
    if (row.license_expires_at != null && row.license_expires_at && new Date(row.license_expires_at).getTime() <= Date.now()) return deny("LICENSE_EXPIRED", 403, requestId);
    if (!row.content) return deny("SCRIPT_CONTENT_MISSING", 404, requestId);

    let bound = null;
    if (!isTestRuntime) {
      bound = await bindRuntimeHwid(env, row.license_id, row.license_user_id, hwid);
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
        "x-frezen-hwid-bound": bound?.fingerprint ? "true" : "false",
        ...(bound?.fingerprint ? { "x-frezen-hwid-fingerprint": bound.fingerprint } : {}),
        ...(bound?.device_id ? { "x-frezen-hwid-device": bound.device_id } : {}),
      },
    });
  } catch (error) {
    console.error("script file delivery failed", { requestId, scriptId, message: String(error?.message ?? error) });
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
  return loaderSource(buildInternalLoaderUrl(request, scriptId));
}
