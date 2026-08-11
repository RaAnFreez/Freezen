const SECURITY_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

const json = (data, status = 200, requestId = crypto.randomUUID()) => new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, "x-request-id": requestId } });
const notFound = (requestId) => json({ error: "NOT_FOUND", request_id: requestId }, 404, requestId);
const methodNotAllowed = (requestId) => json({ error: "METHOD_NOT_ALLOWED", request_id: requestId }, 405, requestId);
const databaseUnavailable = (requestId) => json({ status: "not_configured", request_id: requestId }, 503, requestId);
const unauthorized = (requestId) => json({ error: "UNAUTHENTICATED", message: "Authentication required", request_id: requestId }, 401, requestId);
const authConfigurationError = (requestId) => json({ error: "AUTH_CONFIGURATION_ERROR", request_id: requestId }, 503, requestId);

const timingSafeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
};

const authenticate = (request, env, requestId) => {
  if (!env.AUTH_TOKEN) return { ok: false, response: authConfigurationError(requestId) };
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match || !timingSafeEqual(match[1], env.AUTH_TOKEN)) return { ok: false, response: unauthorized(requestId) };
  return { ok: true };
};

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-csrf-token", "access-control-max-age": "600" } });

    if (url.pathname === "/api/v1/status") {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      return json({ name: "Frezen Control System V3", status: "ok", environment: env.FREZEN_ENV ?? "unknown", database: env.DB ? "configured" : "not_configured", request_id: requestId }, 200, requestId);
    }

    if (url.pathname === "/api/v1/health/db") {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      if (!env.DB) return databaseUnavailable(requestId);
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first();
        return json({ status: result?.ok === 1 ? "ok" : "error", request_id: requestId }, result?.ok === 1 ? 200 : 503, requestId);
      } catch { return json({ status: "error", request_id: requestId }, 503, requestId); }
    }

    if (url.pathname === "/api/v1/auth/verify") {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const auth = authenticate(request, env, requestId);
      if (!auth.ok) return auth.response;
      return json({ authenticated: true, request_id: requestId }, 200, requestId);
    }

    const userMatch = url.pathname.match(/^\/api\/v1\/users\/([^/]+)$/);
    if (userMatch) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const auth = authenticate(request, env, requestId);
      if (!auth.ok) return auth.response;
      if (!env.DB) return databaseUnavailable(requestId);
      const externalId = decodeURIComponent(userMatch[1]);
      if (!externalId || externalId.length > 128) return json({ error: "INVALID_EXTERNAL_ID", request_id: requestId }, 400, requestId);
      try {
        const user = await env.DB.prepare("SELECT id, external_id, display_name, created_at, updated_at FROM users WHERE external_id = ?1 LIMIT 1").bind(externalId).first();
        if (!user) return json({ error: "USER_NOT_FOUND", request_id: requestId }, 404, requestId);
        return json({ user: { id: user.id, external_id: user.external_id, display_name: user.display_name, created_at: user.created_at, updated_at: user.updated_at }, request_id: requestId }, 200, requestId);
      } catch { return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId); }
    }

    const licenseMatch = url.pathname.match(/^\/api\/v1\/licenses\/([^/]+)$/);
    if (licenseMatch) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      const auth = authenticate(request, env, requestId);
      if (!auth.ok) return auth.response;
      if (!env.DB) return databaseUnavailable(requestId);
      const licenseId = decodeURIComponent(licenseMatch[1]);
      if (!licenseId || licenseId.length > 128) return json({ error: "INVALID_LICENSE_ID", request_id: requestId }, 400, requestId);
      try {
        const license = await env.DB.prepare("SELECT id, user_id, status, expires_at, created_at, updated_at FROM licenses WHERE id = ?1 LIMIT 1").bind(licenseId).first();
        if (!license) return json({ error: "LICENSE_NOT_FOUND", request_id: requestId }, 404, requestId);
        return json({ license: { id: license.id, user_id: license.user_id, status: license.status, expires_at: license.expires_at, created_at: license.created_at, updated_at: license.updated_at }, request_id: requestId }, 200, requestId);
      } catch { return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId); }
    }

    if (url.pathname === "/access-denied") {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      return json({ error: "UNAUTHENTICATED", message: "You can't access this link", request_id: requestId }, 401, requestId);
    }

    return notFound(requestId);
  },
};
