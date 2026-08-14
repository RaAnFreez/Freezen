import { discordConfigStatus } from "./discord.js";

const WINDOW_SQL = {
  "24h": "-24 hours",
  "7d": "-7 days",
  "30d": "-30 days",
  "90d": "-90 days",
};

const safeNumber = (value) => Number(value ?? 0);

async function count(db, sql, binds = []) {
  const statement = db.prepare(sql);
  const result = binds.length ? await statement.bind(...binds).first() : await statement.first();
  return safeNumber(result?.count);
}

async function optionalCount(db, sql, binds = []) {
  try {
    return await count(db, sql, binds);
  } catch {
    // Optional integration telemetry must never make the whole dashboard unavailable.
    return 0;
  }
}

async function series(db, sql, windowSql) {
  const result = await db.prepare(sql).bind(windowSql).all();
  return (result.results ?? []).map((row) => ({ date: row.date, count: safeNumber(row.count) }));
}

export async function getDashboardOverview(request, env, requestId, json, auth) {
  if (!env.DB) return json({ error: "DATABASE_UNAVAILABLE", request_id: requestId }, 503, requestId);
  const requestedWindow = new URL(request.url).searchParams.get("range")?.toLowerCase() ?? "7d";
  const range = WINDOW_SQL[requestedWindow] ? requestedWindow : "7d";
  const windowSql = WINDOW_SQL[range];

  try {
    const [totalLicenses, activeLicenses, expiredLicenses, revokedLicenses, users, scriptRequests, safelinkuClaims, hwidResets] = await Promise.all([
      count(env.DB, "SELECT COUNT(*) AS count FROM licenses"),
      count(env.DB, "SELECT COUNT(*) AS count FROM licenses WHERE status = 'ACTIVE'"),
      count(env.DB, "SELECT COUNT(*) AS count FROM licenses WHERE status = 'EXPIRED' OR (expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP AND status = 'ACTIVE')"),
      count(env.DB, "SELECT COUNT(*) AS count FROM licenses WHERE status = 'REVOKED'"),
      count(env.DB, "SELECT COUNT(*) AS count FROM users WHERE status = 'ACTIVE'"),
      count(env.DB, "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'SCRIPT_REQUESTED' AND created_at >= datetime('now', ?1)", [windowSql]),
      optionalCount(env.DB, "SELECT COUNT(*) AS count FROM claims WHERE provider = 'safelinku' AND status = 'SUCCESS' AND created_at >= datetime('now', ?1)", [windowSql]),
      count(env.DB, "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'HWID_RESET' AND created_at >= datetime('now', ?1)", [windowSql]),
    ]);

    const [licenseActivity, scriptActivity, recentActivity] = await Promise.all([
      series(env.DB, "SELECT strftime('%Y-%m-%d', created_at) AS date, COUNT(*) AS count FROM licenses WHERE created_at >= datetime('now', ?1) GROUP BY strftime('%Y-%m-%d', created_at) ORDER BY date", windowSql),
      series(env.DB, "SELECT strftime('%Y-%m-%d', created_at) AS date, COUNT(*) AS count FROM audit_logs WHERE action = 'SCRIPT_REQUESTED' AND created_at >= datetime('now', ?1) GROUP BY strftime('%Y-%m-%d', created_at) ORDER BY date", windowSql),
      env.DB.prepare("SELECT id, action, resource_type, resource_id, status, request_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10").all(),
    ]);

    return json({
      range,
      metrics: { total_licenses: totalLicenses, active_licenses: activeLicenses, expired_licenses: expiredLicenses, revoked_licenses: revokedLicenses, users, script_requests: scriptRequests, safelinku_claims: safelinkuClaims, hwid_resets: hwidResets },
      charts: { license_activity: licenseActivity, script_requests: scriptActivity },
      recent_activity: recentActivity.results ?? [],
      discord: discordConfigStatus(env),
      viewer: { user_id: auth.user_id, role: auth.role },
      request_id: requestId,
    }, 200, requestId);
  } catch {
    return json({ error: "DATABASE_ERROR", request_id: requestId }, 503, requestId);
  }
}
