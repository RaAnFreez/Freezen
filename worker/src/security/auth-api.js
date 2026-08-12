import {
  clearSessionCookie,
  createPasswordResetToken,
  createSession,
  getSession,
  hashPassword,
  sessionCookie,
  consumePasswordResetToken,
  verifyPassword,
} from "./session-auth.js";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 12;

const safeJson = async (request) => {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
};

const normalizeEmail = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const rateLimitKey = (email) => `login:${email}`;

async function isLoginRateLimited(db, email) {
  const row = await db.prepare("SELECT window_started_at, attempts FROM auth_rate_limits WHERE identifier = ?1 LIMIT 1").bind(rateLimitKey(email)).first();
  if (!row) return false;
  const started = Date.parse(row.window_started_at);
  if (!Number.isFinite(started) || Date.now() - started >= LOGIN_WINDOW_MS) {
    await db.prepare("DELETE FROM auth_rate_limits WHERE identifier = ?1").bind(rateLimitKey(email)).run();
    return false;
  }
  return Number(row.attempts) >= LOGIN_MAX_ATTEMPTS;
}

async function recordLoginFailure(db, email) {
  const key = rateLimitKey(email);
  const row = await db.prepare("SELECT window_started_at, attempts FROM auth_rate_limits WHERE identifier = ?1 LIMIT 1").bind(key).first();
  const now = new Date().toISOString();
  if (!row || Date.now() - Date.parse(row.window_started_at) >= LOGIN_WINDOW_MS) {
    await db.prepare("INSERT OR REPLACE INTO auth_rate_limits (identifier, window_started_at, attempts, updated_at) VALUES (?1, ?2, 1, ?2)").bind(key, now).run();
    return;
  }
  await db.prepare("UPDATE auth_rate_limits SET attempts = attempts + 1, updated_at = ?2 WHERE identifier = ?1").bind(key, now).run();
}

async function clearLoginFailures(db, email) {
  await db.prepare("DELETE FROM auth_rate_limits WHERE identifier = ?1").bind(rateLimitKey(email)).run();
}

export async function login(request, env, requestId, json) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);

  // A valid existing session means the user is already authenticated.
  // Re-login must not create a second active session; the client should return to /dashboard.
  try {
    const existingSession = await getSession(request, env.DB);
    if (existingSession) {
      return json({
        authenticated: true,
        already_authenticated: true,
        redirect_to: "/dashboard",
        user: { id: existingSession.user_id, email: existingSession.email, username: existingSession.username, role: existingSession.role },
        expires_at: existingSession.expires_at,
        request_id: requestId,
      }, 200, requestId);
    }
  } catch {
    return json({ error: "AUTHENTICATION_ERROR", request_id: requestId }, 503, requestId);
  }

  const body = await safeJson(request);
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  if (!email || email.length > 320 || typeof password !== "string" || password.length > 256) {
    return json({ error: "INVALID_CREDENTIALS", request_id: requestId }, 400, requestId);
  }
  try {
    if (await isLoginRateLimited(env.DB, email)) {
      return json({ error: "RATE_LIMITED", message: "Too many login attempts. Try again later.", request_id: requestId }, 429, requestId);
    }
    const user = await env.DB.prepare("SELECT id, email, username, password_hash, role, status FROM users WHERE email = ?1 LIMIT 1").bind(email).first();
    const validPassword = user?.password_hash ? await verifyPassword(password, user.password_hash) : false;
    if (!user || !validPassword || user.status !== "ACTIVE") {
      await recordLoginFailure(env.DB, email);
      return json({ error: "INVALID_CREDENTIALS", request_id: requestId }, 401, requestId);
    }
    await clearLoginFailures(env.DB, email);
    // Revoke the prior session set before issuing a fresh session after a real login.
    await env.DB.prepare("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?1 AND revoked_at IS NULL").bind(user.id).run();
    const session = await createSession(env.DB, user.id);
    await env.DB.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(user.id).run();
    return json({
      authenticated: true,
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
      expires_at: session.expiresAt,
      redirect_to: "/dashboard",
      request_id: requestId,
    }, 200, requestId, { "set-cookie": sessionCookie(session.token) });
  } catch {
    return json({ error: "AUTHENTICATION_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function logout(request, env, requestId, json) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId, { "set-cookie": clearSessionCookie() });
  try {
    const session = await getSession(request, env.DB);
    if (session) await env.DB.prepare("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(session.id).run();
    return json({ authenticated: false, redirect_to: "/login", request_id: requestId }, 200, requestId, { "set-cookie": clearSessionCookie() });
  } catch {
    return json({ error: "LOGOUT_ERROR", request_id: requestId }, 503, requestId, { "set-cookie": clearSessionCookie() });
  }
}

export async function listSessions(request, env, requestId, json, currentUser) {
  try {
    const result = await env.DB.prepare("SELECT id, created_at, expires_at, revoked_at, last_seen_at FROM sessions WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50").bind(currentUser.user_id).all();
    return json({ sessions: result?.results ?? [], request_id: requestId }, 200, requestId);
  } catch { return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId); }
}

export async function revokeSession(request, env, requestId, json, currentUser, sessionId) {
  if (!sessionId || sessionId.length > 128) return json({ error: "INVALID_SESSION_ID", request_id: requestId }, 400, requestId);
  try {
    const result = await env.DB.prepare("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL").bind(sessionId, currentUser.user_id).run();
    if (!result?.meta?.changes) return json({ error: "SESSION_NOT_FOUND", request_id: requestId }, 404, requestId);
    return json({ revoked: true, request_id: requestId }, 200, requestId);
  } catch { return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId); }
}

export async function forgotPassword(request, env, requestId, json) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  const body = await safeJson(request);
  const email = normalizeEmail(body?.email);
  if (!email || email.length > 320) return json({ error: "INVALID_REQUEST", request_id: requestId }, 400, requestId);
  try {
    const user = await env.DB.prepare("SELECT id, status FROM users WHERE email = ?1 LIMIT 1").bind(email).first();
    const response = { message: "If an eligible account exists, password reset instructions will be provided.", request_id: requestId };
    if (!user || user.status !== "ACTIVE") return json(response, 200, requestId);
    const reset = await createPasswordResetToken(env.DB, user.id);
    if (env.FREZEN_ENV !== "production") response.reset_token = reset.token;
    return json(response, 200, requestId);
  } catch { return json({ error: "PASSWORD_RESET_ERROR", request_id: requestId }, 503, requestId); }
}

export async function resetPassword(request, env, requestId, json) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  const body = await safeJson(request);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = body?.password;
  if (!token || typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH || password.length > 256) return json({ error: "INVALID_RESET_REQUEST", request_id: requestId }, 400, requestId);
  try {
    const reset = await consumePasswordResetToken(env.DB, token);
    if (!reset) return json({ error: "INVALID_OR_EXPIRED_RESET_TOKEN", request_id: requestId }, 400, requestId);
    const passwordHash = await hashPassword(password);
    await env.DB.prepare("UPDATE users SET password_hash = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2").bind(passwordHash, reset.user_id).run();
    await env.DB.prepare("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(reset.id).run();
    await env.DB.prepare("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?1 AND revoked_at IS NULL").bind(reset.user_id).run();
    return json({ password_reset: true, message: "Password reset successfully. Please log in again.", redirect_to: "/login", request_id: requestId }, 200, requestId);
  } catch { return json({ error: "PASSWORD_RESET_ERROR", request_id: requestId }, 503, requestId); }
}
