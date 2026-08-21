import { describe, expect, it } from "vitest";
import { buildRuntimeLoaderSource } from "../src/short-loader.js";

describe("script loader runtime HWID source", () => {
  it("captures Roblox username and user id before delivery", () => {
    const source = buildRuntimeLoaderSource(new Request("https://frezen.test/files/s1.lua"), "s1", "FREZEN-TEST");

    expect(source).toContain("Players.LocalPlayer");
    expect(source).toContain("Players:GetPlayers()");
    expect(source).toContain("Players.PlayerAdded");
    expect(source).toContain("player.Name");
    expect(source).toContain("player.UserId");
    expect(source).toContain('if nameOk and type(name)=="string" and name~="" then game_username=name end;');
    expect(source).toContain('if idOk and uid then game_user_id=tostring(uid) end;');
    expect(source).toContain("&game_username=");
    expect(source).toContain("&game_user_id=");
    expect(source).toContain("HttpService:UrlEncode(game_username)");
    expect(source).toContain("HttpService:UrlEncode(game_user_id)");
  });

  it("keeps HWID capture and fallback behavior intact", () => {
    const source = buildRuntimeLoaderSource(new Request("https://frezen.test/files/s1.lua"), "s1", "FREZEN-TEST");

    expect(source).toContain("RbxAnalyticsService");
    expect(source).toContain("gethwid,get_hwid,getHWID,getexecutorhwid");
    expect(source).toContain("syn.get_hwid");
    expect(source).toContain("FREZEN_HWID_UNAVAILABLE");
    expect(source).toContain("&hwid=");
    expect(source).toContain("HttpService:UrlEncode(hwid)");
    expect(source).toContain('script_key="FREZEN-TEST";');
  });

  it("never emits a loader that silently sends an empty HWID", () => {
    const source = buildRuntimeLoaderSource(new Request("https://frezen.test/files/s1.lua"), "s1", "FREZEN-TEST");

    expect(source).not.toContain("if not ok then hwid=\"\" end");
    expect(source).not.toContain("&hwid=\"\"");
  });
});
