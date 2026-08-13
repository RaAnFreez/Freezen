const DEFAULT_TIMEOUT_MS = 8000;

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return "{}"; }
}

function configured(env) {
  return Boolean(env?.SAFELINKU_API_KEY && env?.SAFELINKU_API_BASE_URL);
}

function baseUrl(env) {
  if (!env?.SAFELINKU_API_BASE_URL) return null;
  try {
    const url = new URL(env.SAFELINKU_API_BASE_URL);
    if (url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch { return null; }
}

async function requestSafeLinkU(env, path = "/", options = {}) {
  const base = baseUrl(env);
  if (!base || !env?.SAFELINKU_API_KEY) return { configured: false, status: 503, ok: false, error: "SAFELINKU_NOT_CONFIGURED" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${env.SAFELINKU_API_KEY}`,
        ...(options.headers ?? {}),
      },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 1000) }; }
    return { configured: true, status: response.status, ok: response.ok, data };
  } catch (error) {
    return { configured: true, status: 503, ok: false, error: error?.name === "AbortError" ? "SAFELINKU_TIMEOUT" : "SAFELINKU_NETWORK_ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}

export function safelinkuConfigStatus(env) {
  const base = baseUrl(env);
  return {
    configured: configured(env) && Boolean(base),
    api_key_configured: Boolean(env?.SAFELINKU_API_KEY),
    base_url_configured: Boolean(base),
    base_url: base ? new URL(base).origin : null,
  };
}

export async function testSafeLinkUConnection(env) {
  if (!configured(env)) return { status: "not_configured", ...safelinkuConfigStatus(env) };
  const result = await requestSafeLinkU(env, "/");
  return {
    status: result.ok ? "ok" : "error",
    http_status: result.status,
    configured: result.configured,
    error: result.error ?? null,
  };
}

export async function recordSafeLinkURequest(env, requestId, outcome) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(`INSERT INTO security_events (id, event_type, request_id, metadata, created_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))`)
      .bind(crypto.randomUUID(), outcome === "success" ? "SAFE_LINK_CLAIM" : "SAFE_LINK_CLAIM_FAILED", requestId, safeJson({ provider: "safelinku" }))
      .run();
  } catch {
    // Telemetry must never break the claim/request flow.
  }
}

export async function getSafeLinkUStats(env) {
  if (!env?.DB) return { successful_claims: 0, failed_claims: 0, last_request: null };
  try {
    const rows = await env.DB.prepare(`SELECT event_type, request_id, created_at FROM security_events WHERE event_type IN ('SAFE_LINK_CLAIM', 'SAFE_LINK_CLAIM_FAILED') ORDER BY created_at DESC LIMIT 1000`).all();
    const results = rows?.results ?? [];
    return {
      successful_claims: results.filter((row) => row.event_type === "SAFE_LINK_CLAIM").length,
      failed_claims: results.filter((row) => row.event_type === "SAFE_LINK_CLAIM_FAILED").length,
      last_request: results[0] ? { request_id: results[0].request_id, created_at: results[0].created_at, status: results[0].event_type === "SAFE_LINK_CLAIM" ? "success" : "failed" } : null,
    };
  } catch {
    return { successful_claims: 0, failed_claims: 0, last_request: null };
  }
}

// Phase 21 deliberately does not invent a SafeLinkU claim/checkpoint endpoint.
// When SafeLinkU provides the official API contract, add the exact documented path
// and payload here without exposing SAFELINKU_API_KEY to clients.
export async function createClaim(env, requestId, payload) {
  void payload;
  await recordSafeLinkURequest(env, requestId, "failed");
  return { ok: false, status: 501, error: "SAFELINKU_CLAIM_ENDPOINT_NOT_CONFIGURED", request_id: requestId };
}
