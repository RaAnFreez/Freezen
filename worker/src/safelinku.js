const DEFAULT_TIMEOUT_MS = 8000;
const SAFELINKU_LINKS_ENDPOINT = "https://safelinku.com/api/v1/links";

function configured(env) {
  // The documented SafeLinkU REST API authenticates with the API token
  // directly against the fixed /api/v1/links endpoint. A separate base URL
  // is therefore not required for the real integration.
  return Boolean(env?.SAFELINKU_API_KEY);
}

function legacyBaseUrl(env) {
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

async function requestSafeLinkU(env, options = {}) {
  if (!env?.SAFELINKU_API_KEY) {
    return { configured: false, status: 503, ok: false, error: "SAFELINKU_NOT_CONFIGURED", data: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${env.SAFELINKU_API_KEY}`,
  };

  try {
    const response = await fetch(SAFELINKU_LINKS_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(options.body ?? {}),
      signal: controller.signal,
    });
    const status = response.status;
    const data = await response.json().catch(() => ({}));
    const ok = isHttpSuccess(status) || response.ok === true;
    return {
      configured: true,
      status,
      ok,
      error: ok ? null : data?.error ?? data?.message ?? `SAFELINKU_HTTP_${status}`,
      data,
    };
  } catch (error) {
    return {
      configured: true,
      status: 503,
      ok: false,
      error: error?.name === "AbortError" ? "SAFELINKU_TIMEOUT" : "SAFELINKU_NETWORK_ERROR",
      data: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function safelinkuConfigStatus(env) {
  const legacyBase = legacyBaseUrl(env);
  return {
    configured: configured(env),
    api_key_configured: Boolean(env?.SAFELINKU_API_KEY),
    endpoint: SAFELINKU_LINKS_ENDPOINT,
    ...(legacyBase
      ? {
          base_url_configured: true,
          base_url: new URL(legacyBase).origin,
        }
      : {}),
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

  const body = { url: target.toString() };
  if (options.alias) body.alias = String(options.alias).slice(0, 80);
  if (options.passcode) body.passcode = String(options.passcode).slice(0, 120);

  const result = await requestSafeLinkU(env, { body });
  const shortUrl = typeof result.data?.url === "string"
    ? result.data.url
    : typeof result.data?.short_url === "string"
      ? result.data.short_url
      : null;
  const status = result.ok && shortUrl ? "ok" : "error";
  if (requestId) await recordSafeLinkURequest(env, requestId, status === "ok" ? "success" : "failed");

  return {
    status,
    http_status: result.status,
    configured: result.configured,
    url: shortUrl,
    error: status === "ok" ? null : result.error ?? "SAFELINKU_LINK_CREATION_FAILED",
  };
}

export async function testSafeLinkUConnection(env, requestId = null) {
  // The real Provider Test uses the same authenticated link-creation API as
  // production. The generated URL is returned to the dashboard so the Test
  // button can open the actual SafeLinkU checkpoint instead of a fake URL.
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

export async function createClaim(env, requestId) {
  await recordSafeLinkURequest(env, requestId, "failed");
  return { ok: false, status: 501, error: "SAFELINKU_CLAIM_ENDPOINT_NOT_CONFIGURED", request_id: requestId };
}
