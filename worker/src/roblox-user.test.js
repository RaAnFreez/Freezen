import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrateRobloxUsernames, resolveRobloxUsername } from "./roblox-user.js";

describe("Roblox username resolver", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("resolves a numeric Roblox user id", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "TestPlayer", displayName: "Test Player" }), { status: 200 }));
    await expect(resolveRobloxUsername("123456")).resolves.toBe("TestPlayer");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://users.roblox.com/v1/users/123456",
      { headers: { accept: "application/json" } },
    );
  });

  it("hydrates missing usernames and persists the resolved value", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "ResolvedPlayer", displayName: "Resolved Player" }), { status: 200 }));
    const updates = [];
    const env = {
      DB: {
        prepare(sql) {
          return {
            bind(...params) {
              return {
                async run() { updates.push({ sql, params }); },
              };
            },
          };
        },
      },
    };
    const devices = [
      { id: "device-1", game_user_id: "111", game_username: "" },
      { id: "device-2", game_user_id: "222", game_username: "ExistingPlayer" },
    ];

    await hydrateRobloxUsernames(env, devices);

    expect(devices[0].game_username).toBe("ResolvedPlayer");
    expect(devices[1].game_username).toBe("ExistingPlayer");
    expect(updates).toHaveLength(1);
    expect(updates[0].params).toEqual(["ResolvedPlayer", "device-1"]);
  });

  it("falls back to displayName when Roblox does not return name", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ displayName: "Display Only" }), { status: 200 }));
    await expect(resolveRobloxUsername("999")).resolves.toBe("Display Only");
  });
});
