import { hashPassword } from "./session-auth.js";

const OWNER_ROLE = "OWNER";
const ACTIVE_STATUS = "ACTIVE";

export async function setupOwner(request, env, requestId, json) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);

  const setupSecret = env.FREZEN_MASTER_SECRET;
  if (typeof setupSecret !== "string" || setupSecret.length < 32) {
    return json({ error: "OWNER_SETUP_NOT_CONFIGURED", request_id: requestId }, 503, requestId);
  }

  const suppliedSecret = request.headers.get("x-frezen-setup-secret") ?? "";
  if (!suppliedSecret || suppliedSecret !== setupSecret) {
    return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  }

  const configuredEmail = typeof env.OWNER_EMAIL === "string" ? env.OWNER_EMAIL.trim().toLowerCase() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : configuredEmail;
  const password = typeof body?.password === "string" ? body.password : "";
  const username = typeof body?.username === "string" ? body.username.trim() : null;

  if (!configuredEmail || email !== configuredEmail) {
    return json({ error: "OWNER_EMAIL_MISMATCH", request_id: requestId }, 400, requestId);
  }
  if (!email || email.length > 320 || !email.includes("@")) {
    return json({ error: "INVALID_EMAIL", request_id: requestId }, 400, requestId);
  }
  if (password.length < 12 || password.length > 256) {
    return json({ error: "INVALID_PASSWORD", request_id: requestId }, 400, requestId);
  }
  if (username && (username.length < 3 || username.length > 64)) {
    return json({ error: "INVALID_USERNAME", request_id: requestId }, 400, requestId);
  }

  try {
    const existingOwner = await env.DB.prepare("SELECT id FROM users WHERE role = ?1 LIMIT 1").bind(OWNER_ROLE).first();
    if (existingOwner) return json({ error: "OWNER_ALREADY_EXISTS", request_id: requestId }, 409, requestId);

    const existingEmail = await env.DB.prepare("SELECT id FROM users WHERE email = ?1 LIMIT 1").bind(email).first();
    if (existingEmail) return json({ error: "EMAIL_ALREADY_EXISTS", request_id: requestId }, 409, requestId);

    const passwordHash = await hashPassword(password);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id, email, username, password_hash, role, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    ).bind(id, email, username, passwordHash, OWNER_ROLE, ACTIVE_STATUS).run();

    return json({ created: true, owner: { id, email, username, role: OWNER_ROLE, status: ACTIVE_STATUS }, request_id: requestId }, 201, requestId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}
