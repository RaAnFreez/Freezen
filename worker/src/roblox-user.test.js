import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrateRobloxUsernames, resolveRobloxUsername } from "./roblox-user.js";

describe("Roblox username resolver", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("resolves a numeric Roblox user id", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "TestPlayer" }), { status: 200 }));
    await expect(resolveRobloxUsername("123456")).resolves.toBe("TestPlayer");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://users.roblox.com/v1/users/123456",
      { headers: { accept: "application/json" } },
    );
  });

  it("hydrates only records that do not already have a username", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "ResolvedPlayer" }), { status: 200 }));
    const devices = [
      { game_user_id: "111", game_username: "" },
      { game_user_id: "222", game_username: "ExistingPlayer" },
    ];
    await hydrateRobloxUsernames(devices);
    expect(devices[0].game_username).toBe("ResolvedPlayer");
    expect(devices[1].game_username).toBe("ExistingPlayer");
  });
});
