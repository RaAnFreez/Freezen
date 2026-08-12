const encoder = new TextEncoder();

const sha256Hex = async (value) => {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const isExpired = (expiresAt) => {
  if (!expiresAt) return false;
  const timestamp = new Date(expiresAt).getTime();
  return !Number.isNaN(timestamp) && timestamp <= Date.now();
};

export async function validateLicense(request, env, requestId, json) {
  if (!env.DB) {
    return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  }

  const licenseKey = typeof body?.license_key === "string" ? body.license_key.trim() : "";
  if (!licenseKey || licenseKey.length > 512) {
    return json({ error: "INVALID_LICENSE_KEY", request_id: requestId }, 400, requestId);
  }

  try {
    const licenseKeyHash = await sha256Hex(licenseKey);
    const license = await env.DB
      .prepare(
        "SELECT id, user_id, product_id, status, expires_at, max_devices, current_hwid FROM licenses WHERE license_key_hash = ?1 LIMIT 1",
      )
      .bind(licenseKeyHash)
      .first();

    if (!license) {
      return json({ error: "LICENSE_NOT_FOUND", request_id: requestId }, 404, requestId);
    }

    const status = typeof license.status === "string" ? license.status.trim().toLowerCase() : "";
    if (status === "revoked") {
      return json({ error: "LICENSE_REVOKED", request_id: requestId }, 403, requestId);
    }
    if (status === "banned") {
      return json({ error: "LICENSE_BANNED", request_id: requestId }, 403, requestId);
    }

    if (status === "expired" || isExpired(license.expires_at)) {
      if (status === "active") {
        try {
          await env.DB.prepare("UPDATE licenses SET status = 'expired' WHERE id = ?1 AND status = 'active'").bind(license.id).run();
          await env.DB.prepare(
            "INSERT INTO license_audit_log (id, license_id, previous_status, new_status) VALUES (?1, ?2, 'active', 'expired')",
          ).bind(crypto.randomUUID(), license.id).run();
        } catch {
          // Validation remains fail-closed even if the status synchronization write cannot complete.
        }
      }
      return json({ error: "LICENSE_EXPIRED", request_id: requestId }, 403, requestId);
    }

    if (status !== "active") {
      return json({ error: "LICENSE_INACTIVE", request_id: requestId }, 403, requestId);
    }

    return json(
      {
        valid: true,
        license: {
          id: license.id,
          user_id: license.user_id,
          product_id: license.product_id,
          status: "active",
          expires_at: license.expires_at,
          max_devices: license.max_devices,
          hwid_bound: Boolean(license.current_hwid),
        },
        request_id: requestId,
      },
      200,
      requestId,
    );
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}
