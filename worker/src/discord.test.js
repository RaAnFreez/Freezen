import { describe, expect, it } from "vitest";
import { discordConfigStatus, discordIntegrationStatus } from "./discord.js";

describe("Discord integration status", () => {
  it("reports configuration without exposing secret values", () => {
    const env = {
      DISCORD_BOT_TOKEN: "secret-token",
      DISCORD_BOT_SECRET: "secret-value",
      DISCORD_CLIENT_ID: "123",
      DISCORD_GUILD_ID: "456",
      DISCORD_BUYER_ROLE_ID: "789",
      FREZEN_ENV: "production",
    };

    const status = discordConfigStatus(env);
    expect(status.configured).toBe(true);
    expect(status.bot_token_configured).toBe(true);
    expect(status.bot_secret_configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("secret-token");
    expect(JSON.stringify(status)).not.toContain("secret-value");
  });

  it("reports incomplete configuration safely", () => {
    const status = discordIntegrationStatus({ DISCORD_CLIENT_ID: "123" });
    expect(status.configured).toBe(false);
    expect(status.bot).toBe("not_configured");
    expect(status.guild).toBe("not_configured");
    expect(status.buyer_role).toBe("not_configured");
    expect(status.connection).toBe("not_tested");
  });
});
