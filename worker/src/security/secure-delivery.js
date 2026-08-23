import { isFrezenObfuscated, OBFUSCATION_MARKER, OBFUSCATION_PROFILE } from '../script-obfuscation-contract.js';

const encoder = new TextEncoder();
const TOKEN_TTL_SECONDS = 60;
const MAX_TOKEN_BYTES = 4096;

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function verifyHmac(secret, value, signature) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(value));
}

export async function issueDeliveryToken(env, claims) {
  if (!env.FREZEN_MASTER_SECRET || env.FREZEN_MASTER_SECRET.length < 32) throw new Error("DELIVERY_SECRET_NOT_CONFIGURED");
  const payload = { ...claims, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS, nonce: crypto.randomUUID() };
  const encoded = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = base64url(await hmac(env.FREZEN_MASTER_SECRET, encoded));
  return `${encoded}.${signature}`;
}

async function parseToken(env, token) {
  if (!env.FREZEN_MASTER_SECRET || env.FREZEN_MASTER_SECRET.length < 32) return { error: "DELIVERY_SECRET_NOT_CONFIGURED" };
  if (!token || token.length > MAX_TOKEN_BYTES) return { error: "INVALID_DELIVERY_TOKEN" };
  const parts = token.split(".");
  if (parts.length !== 2) return { error: "INVALID_DELIVERY_TOKEN" };
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(fromBase64url(parts[0]))); } catch { return { error: "INVALID_DELIVERY_TOKEN" }; }
  const signature = (() => { try { return fromBase64url(parts[1]); } catch { return null; } })();
  if (!signature || !(await verifyHmac(env.FREZEN_MASTER_SECRET, parts[0], signature))) return { error: "INVALID_DELIVERY_TOKEN" };
  if (!payload?.exp || payload.exp <= Math.floor(Date.now() / 1000)) return { error: "DELIVERY_TOKEN_EXPIRED" };
  if (!payload.user_id || !payload.license_id || !payload.script_id || !payload.version_id || !payload.device_id) return { error: "INVALID_DELIVERY_TOKEN" };
  return { payload };
}

function bearer(request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

const deny = (json, requestId, error, status = 403) => json({ delivered: false, error, request_id: requestId }, status, requestId);

async function audit(env, userId, action, resourceId, status, requestId, metadata = {}) {
  if (!env.DB) return;
  try {
    await env.DB.prepare("INSERT INTO audit_logs (id,user_id,action,resource_type,resource_id,status,request_id,metadata_json) VALUES (?1,?2,?3,'script',?4,?5,?6,?7)").bind(crypto.randomUUID(), userId ?? null, action, resourceId ?? null, status, requestId, JSON.stringify(metadata)).run();
  } catch {}
}

export async function deliverScript(request, env, requestId, json) {
  if (request.method !== "POST") return deny(json, requestId, "METHOD_NOT_ALLOWED", 405);
  if (!env.DB) return deny(json, requestId, "DATABASE_UNAVAILABLE", 503);
  const parsed = await parseToken(env, bearer(request));
  if (parsed.error) { await audit(env, null, "SCRIPT_DELIVERY_DENIED", null, "DENIED", requestId, { reason: parsed.error }); return deny(json, requestId, parsed.error, parsed.error === "DELIVERY_TOKEN_EXPIRED" ? 401 : 403); }
  const claims = parsed.payload;
  try {
    const row = await env.DB.prepare(`SELECT u.status AS user_status,l.user_id,l.product_id,l.status AS license_status,l.expires_at,s.id AS script_id,s.status AS script_status,s.product_id AS script_product_id,p.status AS product_status,d.id AS device_id,d.status AS device_status,sv.id AS version_id,sv.version,sv.status AS version_status,sf.file_name,sf.content,sf.content_type,sf.size_bytes,sf.sha256
      FROM licenses l
      JOIN users u ON u.id=l.user_id
      JOIN scripts s ON s.id=?1
      JOIN products p ON p.id=s.product_id
      JOIN devices d ON d.id=?2 AND d.license_id=l.id AND d.user_id=l.user_id
      JOIN script_versions sv ON sv.id=?3 AND sv.script_id=s.id
      JOIN script_files sf ON sf.script_version_id=sv.id
      WHERE l.id=?4 AND l.user_id=?5 LIMIT 1`).bind(claims.script_id, claims.device_id, claims.version_id, claims.license_id, claims.user_id).first();
    if (!row) { await audit(env, claims.user_id, "SCRIPT_DELIVERY_DENIED", claims.script_id, "DENIED", requestId, { reason: "AUTHORIZATION_CONTEXT_INVALID" }); return deny(json, requestId, "AUTHORIZATION_CONTEXT_INVALID"); }
    if (String(row.user_status).toUpperCase() !== "ACTIVE") return deny(json, requestId, "ACCOUNT_INACTIVE");
    if (String(row.license_status).toUpperCase() !== "ACTIVE" || (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())) return deny(json, requestId, "LICENSE_NOT_ACTIVE");
    if (String(row.script_status).toUpperCase() !== "ACTIVE") return deny(json, requestId, "SCRIPT_DISABLED");
    if (String(row.product_status).toUpperCase() !== "ACTIVE" || row.product_id !== row.script_product_id) return deny(json, requestId, "PRODUCT_NOT_ACTIVE");
    if (String(row.device_status).toUpperCase() !== "ACTIVE") return deny(json, requestId, "HWID_BLOCKED");
    if (String(row.version_status).toUpperCase() !== "ACTIVE") return deny(json, requestId, "SCRIPT_VERSION_NOT_ACTIVE");

    const obfuscationVerified = isFrezenObfuscated(row.content);
    await audit(env, claims.user_id, "SCRIPT_REQUESTED", row.script_id, "SUCCESS", requestId, { license_id: row.user_id === claims.user_id ? claims.license_id : null, version_id: row.version_id, obfuscation_verified: obfuscationVerified });
    await audit(env, claims.user_id, "SCRIPT_DELIVERED", row.script_id, "SUCCESS", requestId, { version_id: row.version_id, size_bytes: row.size_bytes, sha256: row.sha256, obfuscation_verified: obfuscationVerified });

    return new Response(row.content, {
      status: 200,
      headers: {
        "content-type": row.content_type || "text/x-lua; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate",
        "pragma": "no-cache",
        "x-content-type-options": "nosniff",
        "content-disposition": `attachment; filename="${row.file_name.replace(/[\"\\\r\n]/g, "_")}"`,
        "x-frezen-version": row.version,
        "x-frezen-request-id": requestId,
        "x-frezen-payload-sha256": row.sha256,
        "x-frezen-obfuscation-status": obfuscationVerified ? "verified" : "legacy-or-unverified",
        "x-frezen-obfuscation-profile": obfuscationVerified ? `${OBFUSCATION_PROFILE.mode};${OBFUSCATION_PROFILE.version};${OBFUSCATION_PROFILE.strength};${OBFUSCATION_PROFILE.protectionLevel};${OBFUSCATION_PROFILE.algorithm}` : `legacy;marker-missing`,
        "x-frezen-obfuscation-marker": obfuscationVerified ? OBFUSCATION_MARKER : "marker-missing",
      }
    });
  } catch { await audit(env, claims.user_id, "SCRIPT_DELIVERY_DENIED", claims.script_id, "ERROR", requestId, { reason: "DATABASE_ERROR" }); return deny(json, requestId, "DATABASE_ERROR", 503); }
}
