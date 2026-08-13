import { hashPassword } from "./session-auth.js";

const OWNER_ROLE = "OWNER";
const ACTIVE_STATUS = "ACTIVE";

const AUTH_COLUMNS = {
  email: "email TEXT COLLATE NOCASE",
  username: "username TEXT COLLATE NOCASE",
  password_hash: "password_hash TEXT",
  role: "role TEXT NOT NULL DEFAULT 'SUPPORT'",
  status: "status TEXT NOT NULL DEFAULT 'ACTIVE'",
  last_login_at: "last_login_at TEXT",
};

async function ensureAuthSchema(db) {
  const result = await db.prepare("PRAGMA table_info(users)").all();
  const columns = new Set((result?.results ?? []).map((row) => row.name));

  for (const [name, definition] of Object.entries(AUTH_COLUMNS)) {
    if (!columns.has(name)) {
      await db.prepare(`ALTER TABLE users ADD COLUMN ${definition}`).run();
      columns.add(name);
    }
  }

  await db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT,
    last_seen_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)").run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_password_reset_user_expires ON password_reset_tokens(user_id, expires_at)").run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS auth_rate_limits (
    identifier TEXT PRIMARY KEY,
    window_started_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated ON auth_rate_limits(updated_at)").run();

  // Legacy D1 databases can contain duplicate nullable values. Do not make
  // first-owner setup fail while rebuilding a unique index over old data.
  // The setup flow performs explicit email/username conflict checks below.
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_users_email_owner_setup ON users(email)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_users_username_owner_setup ON users(username)").run();

  return columns;
}

async function insertOwner(db, columns, values) {
  const row = {
    id: values.id,
    email: values.email,
    username: values.username,
    password_hash: values.passwordHash,
    role: OWNER_ROLE,
    status: ACTIVE_STATUS,
  };
  if (columns.has("external_id")) row.external_id = `owner:${values.id}`;
  if (columns.has("display_name")) row.display_name = values.username || values.email;

  const orderedColumns = Object.keys(row).filter((column) => columns.has(column));
  const placeholders = orderedColumns.map((_, index) => `?${index + 1}`).join(", ");
  const params = orderedColumns.map((column) => row[column]);
  await db.prepare(`INSERT INTO users (${orderedColumns.join(", ")}) VALUES (${placeholders})`).bind(...params).run();
}

export async function setupOwner(request, env, requestId, json) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);

  const setupSecret = env.FREZEN_MASTER_SECRET;
  if (typeof setupSecret !== "string" || setupSecret.length < 32) {
    return json({ error: "OWNER_SETUP_NOT_CONFIGURED", request_id: requestId }, 503, requestId);
  }

  const suppliedSecret = request.headers.get("x-frezen-setup-secret") ?? "";
  if (!suppliedSecret || suppliedSecret !== setupSecret) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);

  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }

  const configuredEmail = typeof env.OWNER_EMAIL === "string" ? env.OWNER_EMAIL.trim().toLowerCase() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : configuredEmail;
  const password = typeof body?.password === "string" ? body.password : "";
  const username = typeof body?.username === "string" ? body.username.trim() : null;

  if (!configuredEmail || email !== configuredEmail) return json({ error: "OWNER_EMAIL_MISMATCH", request_id: requestId }, 400, requestId);
  if (!email || email.length > 320 || !email.includes("@")) return json({ error: "INVALID_EMAIL", request_id: requestId }, 400, requestId);
  if (password.length < 12 || password.length > 256) return json({ error: "INVALID_PASSWORD", request_id: requestId }, 400, requestId);
  if (username && (username.length < 3 || username.length > 64)) return json({ error: "INVALID_USERNAME", request_id: requestId }, 400, requestId);

  try {
    const columns = await ensureAuthSchema(env.DB);
    const existingOwner = await env.DB.prepare("SELECT id FROM users WHERE role = ?1 LIMIT 1").bind(OWNER_ROLE).first();
    if (existingOwner) return json({ error: "OWNER_ALREADY_EXISTS", request_id: requestId }, 409, requestId);

    const existingEmail = await env.DB.prepare("SELECT id FROM users WHERE email = ?1 LIMIT 1").bind(email).first();
    if (existingEmail) return json({ error: "EMAIL_ALREADY_EXISTS", request_id: requestId }, 409, requestId);

    if (username) {
      const existingUsername = await env.DB.prepare("SELECT id FROM users WHERE username = ?1 LIMIT 1").bind(username).first();
      if (existingUsername) return json({ error: "USERNAME_ALREADY_EXISTS", request_id: requestId }, 409, requestId);
    }

    const passwordHash = await hashPassword(password);
    const id = crypto.randomUUID();
    await insertOwner(env.DB, columns, { id, email, username, passwordHash });

    return json({ created: true, owner: { id, email, username, role: OWNER_ROLE, status: ACTIVE_STATUS }, request_id: requestId }, 201, requestId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}
