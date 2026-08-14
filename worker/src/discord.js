export function discordConfigStatus(env) {
  return {
    provider: "discord",
    configured: Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_BOT_SECRET && env.DISCORD_CLIENT_ID && env.DISCORD_GUILD_ID),
    bot_token_configured: Boolean(env.DISCORD_BOT_TOKEN),
    bot_secret_configured: Boolean(env.DISCORD_BOT_SECRET),
    client_id_configured: Boolean(env.DISCORD_CLIENT_ID),
    guild_id_configured: Boolean(env.DISCORD_GUILD_ID),
    buyer_role_configured: Boolean(env.DISCORD_BUYER_ROLE_ID),
    environment: env.FREZEN_ENV ?? "unknown",
  };
}

export function discordIntegrationStatus(env) {
  const config = discordConfigStatus(env);
  return {
    ...config,
    bot: config.bot_token_configured && config.bot_secret_configured ? "configured" : "not_configured",
    guild: config.guild_id_configured ? "configured" : "not_configured",
    buyer_role: config.buyer_role_configured ? "configured" : "not_configured",
    connection: "not_tested",
    note: "Discord credentials are validated for configuration only; secrets are never returned.",
  };
}
