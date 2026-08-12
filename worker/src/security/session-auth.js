const encoder = new TextEncoder();
const ITERATIONS = 120000;
const HASH_BYTES = 32;
const SESSION_BYTES = 32;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const RESET_TTL_SECONDS = 60 * 30;
const COOKIE_NAME = "__Host-frezen_session";

const toBase64Url = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const randomToken = (size) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
};

const sha256 = async (value) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64Url(new Uint8Array(digest));
};

const safeEqual = (left, right) => {
  const a = fromBase64Url(left);
  const b = fromBase64Url(right);
  if (a.length !== b.length) return false;
  return crypto.subtle.timingSafeEqual(a, b);
};

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) {
    throw new Error("INVALID_PASSWORD");
  }
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    HASH_BYTES * 8,
  );
  return `pbkdf2$sha256$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const parts = encoded.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
  try {
    const salt = fromBase64Url(parts[3]);
    const expected = fromBase64Url(parts[4]);
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      key,
      expected.length * 8,
    );
    return crypto.subtle.timingSafeEqual(new Uint8Array(bits), expected);
  } catch {
    return false;
  }
}

export function getSessionCookie(request) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const item of cookie.split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=");
  }
  return null;
}

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function createSession(db, userId) {
  const token = randomToken(SESSION_BYTES);
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?1, ?2, ?3, ?4)",
  ).bind(id, userId, tokenHash, expiresAt).run();
  return { id, token, expiresAt };
}

export async function getSession(request, db) {
  if (!db) return null;
  const token = getSessionCookie(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const session = await db.prepare(
    "SELECT s.id, s.user_id, s.expires_at, s.revoked_at, u.email, u.username, u.role, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 LIMIT 1",
  ).bind(tokenHash).first();
  if (!session || session.revoked_at || session.status !== "ACTIVE") return null;
  if (Date.parse(session.expires_at) <= Date.now()) {
    await db.prepare("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(session.id).run();
    return null;
  }
  await db.prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(session.id).run();
  return session;
}

export async function requireSession(request, env, requestId, json) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  try {
    const session = await getSession(request, env.DB);
    if (!session) return json({ error: "UNAUTHENTICATED", request_id: requestId }, 401, requestId);
    return session;
  } catch {
    return json({ error: "AUTHENTICATION_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function createPasswordResetToken(db, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + RESET_TTL_SECONDS * 1000).toISOString();
  await db.prepare("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ?1 AND used_at IS NULL").bind(userId).run();
  await db.prepare(
    "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?1, ?2, ?3, ?4)",
  ).bind(id, userId, tokenHash, expiresAt).run();
  return { token, expiresAt };
}

export async function consumePasswordResetToken(db, token) {
  if (!token || token.length > 512) return null;
  const tokenHash = await sha256(token);
  const row = await db.prepare(
    "SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?1 LIMIT 1",
  ).bind(tokenHash).first();
  if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) return null;
  return row;
}

export const AUTH_CONSTANTS = {
  SESSION_TTL_SECONDS,
  RESET_TTL_SECONDS,
  COOKIE_NAME,
};
