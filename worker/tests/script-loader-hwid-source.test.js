import { describe, expect, it } from "vitest";
import { buildLoaderSource } from "../src/script-loader.js";

describe("script loader runtime HWID source", () => {
  it("prefers RbxAnalyticsService and falls back to common executor HWID providers", () => {
    const source = buildLoaderSource(new Request("https://frezen.test/files/s1.lua"), "s1");

    expect(source).toContain("RbxAnalyticsService");
    expect(source).toContain("gethwid,get_hwid,getHWID,getexecutorhwid");
    expect(source).toContain("syn.get_hwid");
    expect(source).toContain("FREZEN_HWID_UNAVAILABLE");
    expect(source).toContain("&hwid=");
    expect(source).toContain("HttpService:UrlEncode(hwid)");
  });

  it("never emits a loader that silently sends an empty HWID", () => {
    const source = buildLoaderSource(new Request("https://frezen.test/files/s1.lua"), "s1");

    expect(source).not.toContain("if not ok then hwid=\"\" end");
    expect(source).not.toContain("&hwid=\"\"");
  });
});
