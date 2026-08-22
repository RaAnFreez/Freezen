// SafeLinkU integration.
//
// IMPORTANT — read before touching this file again:
// The previous version of this file called `POST https://safelinku.com/api/v1/links`
// with a JSON body and a `Bearer` token. That endpoint does not match any
// documented or discoverable behavior of the real SafeLinkU service, and its
// own test file (safelinku.test.js) simply asserted that fabricated shape
// back at itself — so the test suite was green while every real checkpoint
// launch failed. That is why the get-key checkpoint flow could never work:
// createSafeLinkUShortLink() always failed, so launchPublicGetKeyCheckpoint()
// (in getkey-public-runtime.js) always returned an error and no SafeLinkU
// link was ever produced.
//
// The real SafeLinkU API (documented at safelinku.top/pages/tools, which is
// SafeLinkU's own reference for their API and predates their domain
// consolidation onto safelinku.com) is a plain GET request with the API
// token and destination URL as query parameters — the same "GET with query
// params, plain-text or JSON reply" shape used by this whole family of
// Indonesian link-locker services (adf.ly-style), not a modern JSON REST API:
//
//   GET https://safelinku.top/api?api=API_TOKEN&url=DEST_URL&alias=ALIAS&format=text
//
// safelinku.top now resolves to an unrelated directory site (the domain
// appears to have changed hands), while safelinku.com is confirmed as
// SafeLinkU's current live site. The `/api` path and query-parameter shape
// are very likely unchanged — this family of services has kept that exact
// contract for years — but nobody, including me, can verify the byte-exact
// current path without your real account. YOUR SafeLinkU dashboard's
// Developer/API section is the authoritative source. If it shows a
// different base URL or path, set SAFELINKU_API_BASE_URL (see .env.example
// / wrangler secret) and this file will use it automatically instead of the
// default below — no code change needed.
//
// Use the "Test Connection" button in the dashboard's SafeLinkU panel
// (calls /api/v1/safelinku/test-connection) to verify this against your
// real account before relying on the full checkpoint flow.

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_API_BASE = "https://safelinku.com/api";

function configured(env) { return Boolean(env?.SAFELINKU_API_KEY); }

function apiBase(env) {
  const configuredBase = env?.SAFELINKU_API_BASE_URL;
  if (configuredBase) {
    try {
      const url = new URL(configuredBase);
      if (url.protocol === "https:" && !url.username && !url.password) {
        return url.toString().replace(/\/$/, "");
      }
    } catch { /* fall through to default below */ }
  }
  return DEFAULT_API_BASE;
}

function isHttpSuccess(status) { return Number.isInteger(status) && status >= 200 && status < 300; }

async function requestSafeLinkU(env, params, options = {}) {
  if (!env?.SAFELINKU_API_KEY) return { configured: false, status: 503, ok: false, error: "SAFELINKU_NOT_CONFIGURED", body: null };
  const url = new URL(apiBase(env));
  url.searchParams.set("api", env.SAFELINKU_API_KEY);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  url.searchParams.set("format", "text");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), { method: "GET", headers: { accept: "text/plain, */*" }, signal: controller.signal });
    const status = response.status;
    const text = (await response.text().catch(() => "")).trim();
    const looksLikeUrl = /^https?:\/\//i.test(text);
    const ok = isHttpSuccess(status) && looksLikeUrl;
    return { configured: true, status, ok, error: ok ? null : (text || `SAFELINKU_HTTP_${status}`), body: text || null };
  } catch (error) {
    return { configured: true, status: 503, ok: false, error: error?.name === "AbortError" ? "SAFELINKU_TIMEOUT" : "SAFELINKU_NETWORK_ERROR", body: null };
  } finally { clearTimeout(timeout); }
}

export function safelinkuConfigStatus(env) {
  return { configured: configured(env), api_key_configured: Boolean(env?.SAFELINKU_API_KEY), endpoint: apiBase(env) };
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
  const params = { url: target.toString() };
  if (options.alias) params.alias = String(options.alias).slice(0, 80);
  const result = await requestSafeLinkU(env, params);
  const shortUrl = result.ok ? result.body : null;
  const status = result.ok && shortUrl ? "ok" : "error";
  if (requestId) await recordSafeLinkURequest(env, requestId, status === "ok" ? "success" : "failed");
  return { status, http_status: result.status, configured: result.configured, url: shortUrl, error: status === "ok" ? null : (result.error ?? "SAFELINKU_LINK_CREATION_FAILED") };
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
  return { status: result.status, http_status: result.http_status, configured: result.configured, api_key_configured: result.configured ? true : false, url: result.url, error: result.error ?? null };
}

export async function recordSafeLinkURequest(env, requestId, outcome) {
  if (!env?.DB || !requestId) return;
  try { await env.DB.prepare(`INSERT INTO safelinku_events (id, outcome, request_id, created_at) VALUES (?1, ?2, ?3, datetime('now'))`).bind(crypto.randomUUID(), outcome, requestId).run(); } catch {}
}

export async function getSafeLinkUStats(env) {
  if (!env?.DB) return { successful_claims: 0, failed_claims: 0, last_request: null };
  try {
    const rows = await env.DB.prepare(`SELECT outcome, request_id, created_at FROM safelinku_events ORDER BY created_at DESC LIMIT 1000`).all();
    const results = rows?.results ?? [];
    return { successful_claims: results.filter((row) => row.outcome === "success").length, failed_claims: results.filter((row) => row.outcome === "failed").length, last_request: results[0] ? { request_id: results[0].request_id, created_at: results[0].created_at, status: results[0].outcome } : null };
  } catch { return { successful_claims: 0, failed_claims: 0, last_request: null }; }
}

export async function createClaim(env, requestId) {
  await recordSafeLinkURequest(env, requestId, "failed");
  return { ok: false, status: 501, error: "SAFELINKU_CLAIM_ENDPOINT_NOT_CONFIGURED", request_id: requestId };
}
