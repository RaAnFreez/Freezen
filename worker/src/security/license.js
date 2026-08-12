const encoder = new TextEncoder();

const sha256Hex = async (value) => {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
        "SELECT id, user_id, status, expires_at FROM licenses WHERE license_key_hash = ?1 LIMIT 1",
      )
      .bind(licenseKeyHash)
      .first();

    if (!license) {
      return json({ error: "LICENSE_NOT_FOUND", request_id: requestId }, 404, requestId);
    }

    if (license.status === "revoked") {
      return json({ error: "LICENSE_REVOKED", request_id: requestId }, 403, requestId);
    }

    const expiresAt = license.expires_at ? new Date(license.expires_at) : null;
    if (license.status === "expired" || (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now())) {
      return json({ error: "LICENSE_EXPIRED", request_id: requestId }, 403, requestId);
    }

    if (license.status !== "active") {
      return json({ error: "LICENSE_INACTIVE", request_id: requestId }, 403, requestId);
    }

    return json(
      {
        valid: true,
        license: {
          id: license.id,
          user_id: license.user_id,
          status: "active",
          expires_at: license.expires_at,
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
