import { getSessionCookie } from "./session-auth.js";

const encoder = new TextEncoder();

const sha256 = async (value) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const json = (data, status, requestId) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-request-id": requestId,
    },
  });

/**
 * Phase 6 dashboard boundary.
 *
 * Authentication is session-cookie based. Authorization in this phase is
 * intentionally limited to account status: ACTIVE accounts may enter the
 * private area. Role-specific permissions belong to Phase 10.
 */
export async function requirePrivateAccess(request, env, requestId) {
  if (!env.DB) {
    return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  }

  const token = getSessionCookie(request);
  if (!token) {
    return json({
      error: "UNAUTHENTICATED",
      message: "You can't access this link",
      request_id: requestId,
    }, 401, requestId);
  }

  try {
    const tokenHash = await sha256(token);
    const session = await env.DB.prepare(
      "SELECT s.id, s.user_id, s.expires_at, s.revoked_at, u.email, u.username, u.role, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 LIMIT 1",
    ).bind(tokenHash).first();

    if (!session || session.revoked_at) {
      return json({
        error: "UNAUTHENTICATED",
        message: "You can't access this link",
        request_id: requestId,
      }, 401, requestId);
    }

    if (Date.parse(session.expires_at) <= Date.now()) {
      await env.DB.prepare("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(session.id).run();
      return json({
        error: "UNAUTHENTICATED",
        message: "You can't access this link",
        request_id: requestId,
      }, 401, requestId);
    }

    if (session.status !== "ACTIVE") {
      return json({
        error: "ACCESS_DENIED",
        message: "Access Denied",
        request_id: requestId,
      }, 403, requestId);
    }

    await env.DB.prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(session.id).run();
    return session;
  } catch {
    return json({ error: "ACCESS_CHECK_FAILED", request_id: requestId }, 503, requestId);
  }
}
