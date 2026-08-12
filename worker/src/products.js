const MAX_NAME = 120;
const MAX_DESCRIPTION = 2000;
const MAX_VERSION = 64;
const STATUSES = new Set(["active", "disabled"]);

const cleanText = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";

function validateProductInput(body, { partial = false } = {}) {
  const input = {};
  if (!partial || body?.name !== undefined) {
    const name = cleanText(body?.name, MAX_NAME);
    if (!name || name.length > MAX_NAME) return { error: "INVALID_PRODUCT_NAME" };
    input.name = name;
  }
  if (!partial || body?.description !== undefined) {
    const description = cleanText(body?.description, MAX_DESCRIPTION);
    if (description.length > MAX_DESCRIPTION) return { error: "INVALID_PRODUCT_DESCRIPTION" };
    input.description = description || null;
  }
  if (!partial || body?.version !== undefined) {
    const version = cleanText(body?.version, MAX_VERSION);
    if (version.length > MAX_VERSION) return { error: "INVALID_PRODUCT_VERSION" };
    input.version = version || null;
  }
  if (body?.status !== undefined) {
    const status = cleanText(body.status, 16).toLowerCase();
    if (!STATUSES.has(status)) return { error: "INVALID_PRODUCT_STATUS" };
    input.status = status.toUpperCase();
  }
  return { input };
}

function publicProduct(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function writeAudit(env, userId, action, resourceId, status, requestId) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, status, request_id) VALUES (?1, ?2, ?3, 'product', ?4, ?5, ?6)",
    ).bind(crypto.randomUUID(), userId ?? null, action, resourceId ?? null, status, requestId).run();
  } catch {
    // Audit logging must not turn an otherwise successful product mutation into a 5xx.
  }
}

export async function listProducts(request, env, requestId, json) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  const url = new URL(request.url);
  const status = cleanText(url.searchParams.get("status"), 16).toUpperCase();
  if (status && !["ACTIVE", "DISABLED"].includes(status)) return json({ error: "INVALID_PRODUCT_STATUS", request_id: requestId }, 400, requestId);

  try {
    const query = status
      ? "SELECT id, name, description, version, status, created_at, updated_at FROM products WHERE status = ?1 ORDER BY created_at DESC"
      : "SELECT id, name, description, version, status, created_at, updated_at FROM products ORDER BY created_at DESC";
    const result = status ? await env.DB.prepare(query).bind(status).all() : await env.DB.prepare(query).all();
    return json({ products: (result?.results ?? []).map(publicProduct), request_id: requestId });
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function getProduct(request, env, requestId, json, productId) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  if (!productId || productId.length > 128) return json({ error: "INVALID_PRODUCT_ID", request_id: requestId }, 400, requestId);
  try {
    const row = await env.DB.prepare(
      "SELECT id, name, description, version, status, created_at, updated_at FROM products WHERE id = ?1 LIMIT 1",
    ).bind(productId).first();
    if (!row) return json({ error: "PRODUCT_NOT_FOUND", request_id: requestId }, 404, requestId);
    return json({ product: publicProduct(row), request_id: requestId });
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function createProduct(request, env, requestId, json, auth) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const { input, error } = validateProductInput(body);
  if (error) return json({ error, request_id: requestId }, 400, requestId);

  try {
    const duplicate = await env.DB.prepare("SELECT id FROM products WHERE lower(name) = lower(?1) LIMIT 1").bind(input.name).first();
    if (duplicate) return json({ error: "PRODUCT_NAME_EXISTS", request_id: requestId }, 409, requestId);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO products (id, name, description, version, status) VALUES (?1, ?2, ?3, ?4, ?5)",
    ).bind(id, input.name, input.description, input.version, input.status ?? "ACTIVE").run();
    await writeAudit(env, auth?.user_id, "PRODUCT_CREATED", id, "SUCCESS", requestId);
    return getProduct(request, env, requestId, json, id);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function updateProduct(request, env, requestId, json, auth, productId) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  if (!productId || productId.length > 128) return json({ error: "INVALID_PRODUCT_ID", request_id: requestId }, 400, requestId);
  let body;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const { input, error } = validateProductInput(body, { partial: true });
  if (error) return json({ error, request_id: requestId }, 400, requestId);
  if (!Object.keys(input).length) return json({ error: "NO_PRODUCT_FIELDS", request_id: requestId }, 400, requestId);

  try {
    const current = await env.DB.prepare("SELECT id, name, description, version, status, created_at, updated_at FROM products WHERE id = ?1 LIMIT 1").bind(productId).first();
    if (!current) return json({ error: "PRODUCT_NOT_FOUND", request_id: requestId }, 404, requestId);
    if (input.name) {
      const duplicate = await env.DB.prepare("SELECT id FROM products WHERE lower(name) = lower(?1) AND id != ?2 LIMIT 1").bind(input.name, productId).first();
      if (duplicate) return json({ error: "PRODUCT_NAME_EXISTS", request_id: requestId }, 409, requestId);
    }
    const next = {
      name: input.name ?? current.name,
      description: input.description !== undefined ? input.description : current.description,
      version: input.version !== undefined ? input.version : current.version,
      status: input.status ?? current.status,
    };
    await env.DB.prepare(
      "UPDATE products SET name = ?1, description = ?2, version = ?3, status = ?4, updated_at = CURRENT_TIMESTAMP WHERE id = ?5",
    ).bind(next.name, next.description, next.version, next.status, productId).run();
    await writeAudit(env, auth?.user_id, "PRODUCT_UPDATED", productId, "SUCCESS", requestId);
    return getProduct(request, env, requestId, json, productId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}

export async function deleteProduct(request, env, requestId, json, auth, productId) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  if (!productId || productId.length > 128) return json({ error: "INVALID_PRODUCT_ID", request_id: requestId }, 400, requestId);
  try {
    const current = await env.DB.prepare("SELECT id FROM products WHERE id = ?1 LIMIT 1").bind(productId).first();
    if (!current) return json({ error: "PRODUCT_NOT_FOUND", request_id: requestId }, 404, requestId);
    const references = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM licenses WHERE product_id = ?1) AS licenses, (SELECT COUNT(*) FROM scripts WHERE product_id = ?1) AS scripts",
    ).bind(productId).first();
    if ((references?.licenses ?? 0) > 0 || (references?.scripts ?? 0) > 0) {
      return json({ error: "PRODUCT_IN_USE", message: "Disable the product instead of deleting it while dependent resources exist.", request_id: requestId }, 409, requestId);
    }
    const result = await env.DB.prepare("DELETE FROM products WHERE id = ?1").bind(productId).run();
    if (result?.meta?.changes !== 1) return json({ error: "PRODUCT_NOT_FOUND", request_id: requestId }, 404, requestId);
    await writeAudit(env, auth?.user_id, "PRODUCT_DELETED", productId, "SUCCESS", requestId);
    return json({ deleted: true, product_id: productId, request_id: requestId });
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}
