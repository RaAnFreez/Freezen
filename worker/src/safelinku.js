const DEFAULT_TIMEOUT_MS = 8000;

function configured(env) {
  return Boolean(env?.SAFELINKU_API_KEY && baseUrl(env));
}

function baseUrl(env) {
  if (!env?.SAFELINKU_API_BASE_URL) return null;
  try {
    const url = new URL(env.SAFELINKU_API_BASE_URL);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isHttpSuccess(status) {
  return Number.isInteger(status) && status >= 200 && status < 300;
}

async function requestSafeLinkU(env, path = "/", options = {}) {
  const base = baseUrl(env);
  if (!base || !env?.SAFELINKU_API_KEY) {
    return { configured: false, status: 503, ok: false, error: "SAFELINKU_NOT_CONFIGURED" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const { timeoutMs: _timeoutMs, headers: suppliedHeaders = {}, signal: _signal, ...requestOptions } = options;
  const headers = {
    accept: "application/json",
    ...(requestOptions.body ? { "content-type": "application/json" } : {}),
    ...suppliedHeaders,
    authorization: `Bearer ${env.SAFELINKU_API_KEY}`,
  };

  try {
    const response = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
      ...requestOptions,
      signal: controller.signal,
      headers,
    });
    const status = response.status;
    // Cloudflare's Fetch Response is the source of truth, but classify by the
    // HTTP status as well so an otherwise-valid 2xx response cannot become a
    // false negative because of an incomplete/mocked `ok` property.
    const ok = isHttpSuccess(status) || response.ok === true;
    return { configured: true, status, ok, error: null };
  } catch (error) {
    return {
      configured: true,
      status: 503,
      ok: false,
      error: error?.name === "AbortError" ? "SAFELINKU_TIMEOUT" : "SAFELINKU_NETWORK_ERROR",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function safelinkuConfigStatus(env) {
  const base = baseUrl(env);
  return {
    configured: configured(env),
    api_key_configured: Boolean(env?.SAFELINKU_API_KEY),
    base_url_configured: Boolean(base),
    base_url: base ? new URL(base).origin : null,
  };
}

export async function testSafeLinkUConnection(env, requestId = null) {
  if (!configured(env)) {
    if (requestId) await recordSafeLinkURequest(env, requestId, "failed");
    return { status: "not_configured", ...safelinkuConfigStatus(env) };
  }

  const result = await requestSafeLinkU(env, "/");
  if (requestId) await recordSafeLinkURequest(env, requestId, result.ok ? "success" : "failed");
  return {
    status: result.ok ? "ok" : "error",
    http_status: result.status,
    configured: result.configured,
    error: result.error ?? null,
  };
}

export async function recordSafeLinkURequest(env, requestId, outcome) {
  if (!env?.DB || !requestId) return;
  try {
    await env.DB.prepare(`INSERT INTO safelinku_events (id, outcome, request_id, created_at) VALUES (?1, ?2, ?3, datetime('now'))`)
      .bind(crypto.randomUUID(), outcome, requestId).run();
  } catch {
    // Provider telemetry must never break the main request flow.
  }
}

export async function getSafeLinkUStats(env) {
  if (!env?.DB) return { successful_claims: 0, failed_claims: 0, last_request: null };
  try {
    const rows = await env.DB.prepare(`SELECT outcome, request_id, created_at FROM safelinku_events ORDER BY created_at DESC LIMIT 1000`).all();
    const results = rows?.results ?? [];
    return {
      successful_claims: results.filter((row) => row.outcome === "success").length,
      failed_claims: results.filter((row) => row.outcome === "failed").length,
      last_request: results[0]
        ? { request_id: results[0].request_id, created_at: results[0].created_at, status: results[0].outcome }
        : null,
    };
  } catch {
    return { successful_claims: 0, failed_claims: 0, last_request: null };
  }
}

// SafeLinkU's public site does not expose a machine-readable claim/checkpoint
// contract in the documentation available to this build. Do not invent an API path.
// This guarded placeholder cannot be used to bypass or fake a provider checkpoint.
export async function createClaim(env, requestId) {
  await recordSafeLinkURequest(env, requestId, "failed");
  return { ok: false, status: 501, error: "SAFELINKU_CLAIM_ENDPOINT_NOT_CONFIGURED", request_id: requestId };
}
