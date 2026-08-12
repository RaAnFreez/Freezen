const encoder = new TextEncoder();
const INVITE_ROLES = new Set(["ADMIN", "SUPPORT"]);
const INVITE_STATUSES = new Set(["ACTIVE", "EXPIRED", "REVOKED", "DISABLED", "USED"]);

const hash = async (value) => {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const randomCode = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const publicInvite = (invite) => ({
  id: invite.id,
  role: invite.role,
  created_at: invite.created_at,
  expires_at: invite.expires_at,
  max_uses: invite.max_uses,
  used_count: invite.used_count,
  status: invite.status,
});

const effectiveStatus = (invite) => {
  if (invite.status === "ACTIVE" && invite.expires_at && Date.parse(invite.expires_at) <= Date.now()) return "EXPIRED";
  if (invite.status === "ACTIVE" && invite.used_count >= invite.max_uses) return "USED";
  return invite.status;
};

export async function createInvite(request, env, requestId, json, auth) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  if (!auth?.user_id || auth.role !== "OWNER") return json({ error: "FORBIDDEN", request_id: requestId }, 403, requestId);

  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const role = typeof body?.role === "string" ? body.role.trim().toUpperCase() : "";
  const maxUses = Number.isInteger(body?.max_uses) ? body.max_uses : 1;
  const expiresInHours = Number.isFinite(body?.expires_in_hours) ? body.expires_in_hours : null;

  if (!INVITE_ROLES.has(role)) return json({ error: "INVALID_INVITE_ROLE", request_id: requestId }, 400, requestId);
  if (maxUses < 1 || maxUses > 1000) return json({ error: "INVALID_MAX_USES", request_id: requestId }, 400, requestId);
  if (expiresInHours !== null && (expiresInHours <= 0 || expiresInHours > 24 * 365)) return json({ error: "INVALID_EXPIRATION", request_id: requestId }, 400, requestId);

  const code = randomCode();
  const codeHash = await hash(code);
  const id = crypto.randomUUID();
  const expiresAt = expiresInHours === null ? null : new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  try {
    await env.DB.prepare(
      "INSERT INTO invites (id, code_hash, role, created_by, expires_at, max_uses, used_count, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 'ACTIVE')",
    ).bind(id, codeHash, role, auth.user_id, expiresAt, maxUses).run();
    return json({ invite: { ...publicInvite({ id, role, created_at: new Date().toISOString(), expires_at: expiresAt, max_uses: maxUses, used_count: 0, status: "ACTIVE" }), code }, request_id: requestId }, 201, requestId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function listInvites(request, env, requestId, json, auth) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  if (!auth?.user_id || auth.role !== "OWNER") return json({ error: "FORBIDDEN", request_id: requestId }, 403, requestId);
  try {
    const result = await env.DB.prepare("SELECT id, role, created_at, expires_at, max_uses, used_count, status FROM invites ORDER BY created_at DESC LIMIT 200").all();
    const rows = (result?.results ?? []).map((invite) => ({ ...invite, status: effectiveStatus(invite) }));
    return json({ invites: rows.map(publicInvite), request_id: requestId });
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function updateInvite(request, env, requestId, json, auth, inviteId) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  if (!auth?.user_id || auth.role !== "OWNER") return json({ error: "FORBIDDEN", request_id: requestId }, 403, requestId);
  if (!inviteId || inviteId.length > 128) return json({ error: "INVALID_INVITE_ID", request_id: requestId }, 400, requestId);
  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const status = typeof body?.status === "string" ? body.status.trim().toUpperCase() : "";
  if (!["REVOKED", "DISABLED"].includes(status)) return json({ error: "INVALID_INVITE_STATUS", request_id: requestId }, 400, requestId);
  try {
    const result = await env.DB.prepare("UPDATE invites SET status = ?1 WHERE id = ?2 AND status = 'ACTIVE'").bind(status, inviteId).run();
    if (!result?.meta || result.meta.changes !== 1) return json({ error: "INVITE_NOT_FOUND_OR_INACTIVE", request_id: requestId }, 404, requestId);
    return json({ updated: true, id: inviteId, status, request_id: requestId });
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function redeemInvite(request, env, requestId, json) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const code = typeof body?.code === "string" ? body.code.trim().toLowerCase() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const username = typeof body?.username === "string" ? body.username.trim() : null;
  if (!code || code.length > 128) return json({ error: "INVALID_INVITE_CODE", request_id: requestId }, 400, requestId);
  if (!email || email.length > 320 || !email.includes("@")) return json({ error: "INVALID_EMAIL", request_id: requestId }, 400, requestId);
  if (password.length < 12 || password.length > 256) return json({ error: "INVALID_PASSWORD", request_id: requestId }, 400, requestId);
  if (username && (username.length < 3 || username.length > 64)) return json({ error: "INVALID_USERNAME", request_id: requestId }, 400, requestId);

  try {
    const codeHash = await hash(code);
    const invite = await env.DB.prepare("SELECT id, role, expires_at, max_uses, used_count, status FROM invites WHERE code_hash = ?1 LIMIT 1").bind(codeHash).first();
    if (!invite) return json({ error: "INVITE_NOT_FOUND", request_id: requestId }, 404, requestId);
    const status = effectiveStatus(invite);
    if (status !== "ACTIVE") return json({ error: `INVITE_${status}`, request_id: requestId }, 409, requestId);

    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?1 LIMIT 1").bind(email).first();
    if (existing) return json({ error: "EMAIL_ALREADY_EXISTS", request_id: requestId }, 409, requestId);
    const { hashPassword } = await import("./session-auth.js");
    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();

    const result = await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, email, username, password_hash, role, status) VALUES (?1, ?2, ?3, ?4, ?5, 'ACTIVE')").bind(userId, email, username, passwordHash, invite.role),
      env.DB.prepare("UPDATE invites SET used_count = used_count + 1, status = CASE WHEN used_count + 1 >= max_uses THEN 'USED' ELSE 'ACTIVE' END WHERE id = ?1 AND status = 'ACTIVE' AND used_count < max_uses").bind(invite.id),
    ]);
    if (!result?.[1]?.meta || result[1].meta.changes !== 1) return json({ error: "INVITE_REDEEM_CONFLICT", request_id: requestId }, 409, requestId);
    return json({ created: true, user: { id: userId, email, username, role: invite.role, status: "ACTIVE" }, request_id: requestId }, 201, requestId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}

export { INVITE_STATUSES };
