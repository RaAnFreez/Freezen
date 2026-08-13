export function runtimeDiagnostics(env, requestId = crypto.randomUUID()) {
  const secret = typeof env?.FREZEN_MASTER_SECRET === "string" ? env.FREZEN_MASTER_SECRET : "";
  const ownerEmail = typeof env?.OWNER_EMAIL === "string" ? env.OWNER_EMAIL.trim() : "";

  return {
    environment: env?.FREZEN_ENV || "unknown",
    master_secret: {
      configured: secret.length > 0,
      valid_length: secret.length >= 32,
      length: secret.length,
    },
    owner_email: {
      configured: ownerEmail.length > 0,
    },
    database: env?.DB ? "configured" : "missing",
    request_id: requestId,
  };
}
