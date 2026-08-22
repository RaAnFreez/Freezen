// SafeLinkU integration.
// The production API contract is documented by the user's SafeLinkU account:
// POST https://safelinku.com/api/v1/links
// Authorization: Bearer <API token>
// Content-Type: application/json
// Body: { url, alias?, passcode? }

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_API_BASE = "https://safelinku.com/api/v1/links";

function configured(env) { return Boolean(env?.SAFELINKU_API_KEY); }

function apiBase(env) {
  const configuredBase = env?.SAFELINKU_API_BASE_URL;
  if (configuredBase) {
    try {
      const url = new URL(configuredBase);
      if (url.protocol === "https:" && !url.username && !url.password) return url.toString().replace(/\/$/, "");
    } catch { /* use documented default */ }
  }
  return DEFAULT_API_BASE;
}

function isHttpSuccess(status) { return Number.isInteger(status) && status >= 200 && status < 300; }

function normalizeProviderError(value, status) {
  if (typeof value === "string") {
    const text = value.trim();
    return text || `SAFELINKU_HTTP_${status}`;
  }
  if (Array.isArray(value)) {
    const messages = value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
    return messages.length ? messages.join("; ") : `SAFELINKU_HTTP_${status}`;
  }
  if (value && typeof value === "object") {
    return normalizeProviderError(value.error ?? value.message ?? value.detail, status);
  }
  return `SAFELINKU_HTTP_${status}`;
}

function summarizeProviderError(text, status) {
  const body = String(text || "").trim();
  if (!body) return `SAFELINKU_HTTP_${status}`;
  if (/<!doctype html|<html[\s>]|attention required|cloudflare/i.test(body)) return `SAFELINKU_NON_API_RESPONSE_HTTP_${status}`;
  try {
    const parsed = JSON.parse(body);
    return normalizeProviderError(parsed, status);
  } catch { return body.slice(0, 300); }
}

async function requestSafeLinkU(env, payload, options = {}) {
  if (!env?.SAFELINKU_API_KEY) return { configured: false, status: 503, ok: false, error: "SAFELINKU_NOT_CONFIGURED", body: null };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(apiBase(env), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${env.SAFELINKU_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const status = response.status;
    const text = (await response.text().catch(() => "")).trim();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    const returnedUrl = typeof parsed?.url === "string" ? parsed.url.trim() : "";
    const ok = isHttpSuccess(status) && /^https?:\/\//i.test(returnedUrl);
    return {
      configured: true,
      status,
      ok,
      error: ok ? null : summarizeProviderError(text, status),
      empty_error_array: Array.isArray(parsed?.error) && parsed.error.length === 0,
      body: parsed,
      text,
      url: ok ? returnedUrl : null,
    };
  } catch (error) {
    return { configured: true, status: 503, ok: false, error: error?.name === "AbortError" ? "SAFELINKU_TIMEOUT" : "SAFELINKU_NETWORK_ERROR", body: null, url: null };
  } finally { clearTimeout(timeout); }
}

export function safelinkuConfigStatus(env) {
  return {
    configured: configured(env),
    api_key_configured: Boolean(env?.SAFELINKU_API_KEY),
    endpoint: apiBase(env),
    method: "POST",
  };
}

export async function createSafeLinkUShortLink(env, targetUrl, options = {}, requestId = null) {
  if (!configured(env)) {
    if (requestId) await recordSafeLinkURequest(env, requestId, "failed");
    return { status: "not_configured", http_status: 503, ...safelinkuConfigStatus(env), url: null, error: "SAFELINKU_NOT_CONFIGURED" };
  }

  let target;
  try {
    target = new URL(targetUrl);
    if (target.protocol !== "https:") throw new Error("TARGET_MUST_USE_HTTPS");
  } catch (error) {
    if (requestId) await recordSafeLinkURequest(env, requestId, "failed");
    return { status: "invalid_target", http_status: 400, configured: true, url: null, error: error?.message || "INVALID_TARGET_URL" };
  }

  const basePayload = { url: target.toString() };
  if (options.passcode) basePayload.passcode = String(options.passcode).slice(0, 120);

  const requestedAlias = options.alias ? String(options.alias).slice(0, 120) : "";
  const payload = requestedAlias ? { ...basePayload, alias: requestedAlias } : basePayload;
  let result = await requestSafeLinkU(env, payload);

  // Some SafeLinkU accounts reject alias validation with a 400 and return
  // an empty `error` array. Retry once without the optional alias so that a
  // valid target URL can still produce the checkpoint link.
  if (!result.ok && requestedAlias && result.status === 400 && result.empty_error_array) {
    result = await requestSafeLinkU(env, basePayload);
  }

  const status = result.ok && result.url ? "ok" : "error";
  if (requestId) await recordSafeLinkURequest(env, requestId, status === "ok" ? "success" : "failed");
  return {
    status,
    http_status: result.status,
    configured: result.configured,
    url: result.url ?? null,
    error: status === "ok" ? null : (result.error ?? `SAFELINKU_HTTP_${result.status}`),
  };
}

export async function createSafeLinkUCheckpoint(env, request, checkpointId, requestId = null) {
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(String(checkpointId || ""))) return { status: "invalid_checkpoint", http_status: 400, url: null, error: "INVALID_CHECKPOINT_ID" };
  const callback = new URL(`/api/v1/get-key/checkpoint/callback?checkpoint_id=${encodeURIComponent(checkpointId)}`, new URL(request.url).origin);
  const created = await createSafeLinkUShortLink(env, callback.toString(), { alias: `frezen-${String(checkpointId).slice(0, 40)}` }, requestId);
  return { ...created, checkpoint_id: checkpointId, destination_url: callback.toString() };
}

export async function testSafeLinkUConnection(env, requestId = null) {
  const target = `https://example.com/?frezen_api_test=${crypto.randomUUID()}`;
  const result = await createSafeLinkUShortLink(env, target, {}, requestId);
  return {
    status: result.status,
    http_status: result.http_status,
    configured: result.configured,
    api_key_configured: result.configured ? true : false,
    url: result.url,
    error: result.error ?? null,
  };
}

export async function recordSafeLinkURequest(env, requestId, outcome) {
  if (!env?.DB || !requestId) return;
  try {
    await env.DB.prepare(`INSERT INTO safelinku_events (id, outcome, request_id, created_at) VALUES (?1, ?2, ?3, datetime('now'))`)
      .bind(crypto.randomUUID(), outcome, requestId).run();
  } catch {}
}

export async function getSafeLinkUStats(env) {
  if (!env?.DB) return { successful_claims: 0, failed_claims: 0, last_request: null };
  try {
    const rows = await env.DB.prepare(`SELECT outcome, request_id, created_at FROM safelinku_events ORDER BY created_at DESC LIMIT 1000`).all();
    const results = rows?.results ?? [];
    return {
      successful_claims: results.filter((row) => row.outcome === "success").length,
      failed_claims: results.filter((row) => row.outcome === "failed").length,
      last_request: results[0] ? { request_id: results[0].request_id, created_at: results[0].created_at, status: results[0].outcome } : null,
    };
  } catch { return { successful_claims: 0, failed_claims: 0, last_request: null }; }
}

export async function createClaim(env, requestId) {
  await recordSafeLinkURequest(env, requestId, "failed");
  return { ok: false, status: 501, error: "SAFELINKU_CLAIM_ENDPOINT_NOT_CONFIGURED", request_id: requestId };
}
