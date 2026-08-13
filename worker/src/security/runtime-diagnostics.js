export function runtimeDiagnostics(env, requestId) {
  const master = typeof env.FREZEN_MASTER_SECRET === "string" ? env.FREZEN_MASTER_SECRET : "";
  const ownerEmail = typeof env.OWNER_EMAIL === "string" ? env.OWNER_EMAIL : "";
  return {
    environment: env.FREZEN_ENV ?? "unknown",
    master_secret: {
      configured: master.length > 0,
      valid_length: master.length >= 32,
      length: master.length,
    },
    owner_email: {
      configured: ownerEmail.length > 0,
    },
    database: env.DB ? "configured" : "not_configured",
    request_id: requestId,
  };
}