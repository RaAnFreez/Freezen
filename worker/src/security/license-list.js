const STATUSES = new Set(["unused", "active", "expired", "revoked", "banned"]);
const MAX_PAGE_SIZE = 50;
const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";

function publicLicense(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username ?? null,
    email: row.email ?? null,
    product_id: row.product_id,
    product_name: row.product_name ?? null,
    status: row.status,
    expires_at: row.expires_at,
    created_at: row.created_at,
    max_devices: row.max_devices,
    last_seen: row.last_seen,
    redeem_count: row.redeem_count,
    reset_count: row.reset_count,
  };
}

export async function listLicenses(request, env, requestId, json) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  const url = new URL(request.url);
  const rawPage = Number(url.searchParams.get("page") ?? "1");
  const rawPageSize = Number(url.searchParams.get("page_size") ?? "20");
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : null;
  const pageSize = Number.isInteger(rawPageSize) && rawPageSize > 0 && rawPageSize <= MAX_PAGE_SIZE ? rawPageSize : null;
  if (page == null) return json({ error: "INVALID_PAGE", request_id: requestId }, 400, requestId);
  if (pageSize == null) return json({ error: "INVALID_PAGE_SIZE", request_id: requestId }, 400, requestId);

  const status = clean(url.searchParams.get("status"), 16).toLowerCase();
  const productId = clean(url.searchParams.get("product_id"), 128);
  const search = clean(url.searchParams.get("q"), 128);
  if (status && !STATUSES.has(status)) return json({ error: "INVALID_LICENSE_STATUS", request_id: requestId }, 400, requestId);
  if (url.searchParams.get("status") && !status) return json({ error: "INVALID_LICENSE_STATUS", request_id: requestId }, 400, requestId);

  const conditions = [];
  const binds = [];
  const add = (sql, ...values) => { conditions.push(sql); binds.push(...values); };
  if (status) add("l.status = ?", status);
  if (productId) add("l.product_id = ?", productId);
  if (search) {
    const pattern = `%${search}%`;
    add("(l.id LIKE ? OR COALESCE(l.user_id, '') LIKE ? OR COALESCE(u.username, '') LIKE ? OR COALESCE(u.email, '') LIKE ? OR l.product_id LIKE ? OR COALESCE(p.name, '') LIKE ?)", pattern, pattern, pattern, pattern, pattern, pattern);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;

  try {
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM licenses l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN products p ON p.id = l.product_id ${where}`,
    ).bind(...binds).first();
    const total = Number(count?.total ?? 0);
    const result = await env.DB.prepare(
      `SELECT l.id, l.user_id, u.username, u.email, l.product_id, p.name AS product_name, l.status, l.expires_at, l.created_at, l.max_devices, l.last_seen, l.redeem_count, l.reset_count FROM licenses l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN products p ON p.id = l.product_id ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`,
    ).bind(...binds, pageSize, offset).all();
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    return json({
      licenses: (result?.results ?? []).map(publicLicense),
      pagination: { page, page_size: pageSize, total, total_pages: totalPages },
      filters: { status: status || null, product_id: productId || null, q: search || null },
      request_id: requestId,
    });
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}
