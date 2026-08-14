import { hashPassword } from "./session-auth.js";

const OWNER_ROLE = "OWNER";
const ACTIVE_STATUS = "ACTIVE";
const REQUIRED_COLUMNS = ["id", "email", "username", "password_hash", "role", "status"];

async function tableColumns(db, tableName) {
  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set((result?.results ?? []).map((row) => row.name));
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
  if (columns.has("display_name")) row.display_name = values.username;

  const orderedColumns = Object.keys(row).filter((column) => columns.has(column));
  const placeholders = orderedColumns.map((_, index) => `?${index + 1}`).join(", ");
  const params = orderedColumns.map((column) => row[column]);
  await db.prepare(`INSERT INTO users (${orderedColumns.join(", ")}) VALUES (${placeholders})`).bind(...params).run();
}

export async function setupOwner(request, env, requestId, json) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);

  const masterSecret = env.FREZEN_MASTER_SECRET;
  const bootstrapPassword = env.OWNER_BOOTSTRAP_PASSWORD;
  const configuredEmail = typeof env.OWNER_EMAIL === "string" ? env.OWNER_EMAIL.trim().toLowerCase() : "";
  const configuredUsername = typeof env.OWNER_BOOTSTRAP_USERNAME === "string" ? env.OWNER_BOOTSTRAP_USERNAME.trim() : "";

  if (typeof masterSecret !== "string" || masterSecret.length < 32 ||
      typeof bootstrapPassword !== "string" || bootstrapPassword.length < 12 ||
      !configuredEmail || !configuredUsername) {
    return json({ error: "OWNER_BOOTSTRAP_NOT_CONFIGURED", request_id: requestId }, 503, requestId);
  }

  const suppliedSecret = request.headers.get("x-frezen-setup-secret") ?? "";
  if (!suppliedSecret || suppliedSecret !== masterSecret) {
    return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  }

  let stage = "users-schema";
  try {
    const columns = await tableColumns(env.DB, "users");
    if (!columns.size) return json({ error: "USERS_SCHEMA_INVALID", stage, request_id: requestId }, 503, requestId);

    const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(column));
    if (missing.length) {
      console.error("Owner bootstrap blocked: authentication columns missing", { request_id: requestId, stage, missing });
      return json({ error: "USERS_SCHEMA_INCOMPATIBLE", stage, request_id: requestId }, 503, requestId);
    }

    stage = "owner-check";
    const existingOwner = await env.DB.prepare("SELECT id FROM users WHERE role = ?1 LIMIT 1").bind(OWNER_ROLE).first();
    if (existingOwner) return json({ error: "OWNER_ALREADY_EXISTS", request_id: requestId }, 409, requestId);

    stage = "email-check";
    const existingEmail = await env.DB.prepare("SELECT id FROM users WHERE email = ?1 LIMIT 1").bind(configuredEmail).first();
    if (existingEmail) return json({ error: "EMAIL_ALREADY_EXISTS", request_id: requestId }, 409, requestId);

    stage = "username-check";
    const existingUsername = await env.DB.prepare("SELECT id FROM users WHERE username = ?1 LIMIT 1").bind(configuredUsername).first();
    if (existingUsername) return json({ error: "USERNAME_ALREADY_EXISTS", request_id: requestId }, 409, requestId);

    stage = "password-hash";
    const passwordHash = await hashPassword(bootstrapPassword);
    const id = crypto.randomUUID();

    stage = "owner-insert";
    await insertOwner(env.DB, columns, { id, email: configuredEmail, username: configuredUsername, passwordHash });

    return json({ created: true, owner: { id, email: configuredEmail, username: configuredUsername, role: OWNER_ROLE, status: ACTIVE_STATUS }, request_id: requestId }, 201, requestId);
  } catch (error) {
    console.error("Owner bootstrap failed", { request_id: requestId, stage, error: error instanceof Error ? error.message : String(error) });
    return json({ error: "DATABASE_ERROR", stage, request_id: requestId }, 503, requestId);
  }
}
