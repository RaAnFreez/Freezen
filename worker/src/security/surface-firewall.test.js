import { describe, expect, it } from "vitest";
import { applySecurityHeaders, isPublicSurface, isOwnerSetupSurface, sameOriginMutation } from "./surface-firewall.js";

describe("public surface firewall", () => {
  it("allows only the intended public entry points", () => {
    expect(isPublicSurface("/login")).toBe(true);
    expect(isPublicSurface("/api/v1/auth/login")).toBe(true);
    expect(isPublicSurface("/get-key/test-service")).toBe(true);
    expect(isPublicSurface("/api/v1/get-key/service/test-service")).toBe(true);
    expect(isPublicSurface("/loader/abc")).toBe(true);
    expect(isPublicSurface("/files/abc.lua")).toBe(true);
    expect(isPublicSurface("/dashboard/")).toBe(false);
    expect(isPublicSurface("/api/v1/status")).toBe(false);
    expect(isPublicSurface("/api/v1/health/db")).toBe(false);
    expect(isPublicSurface("/api/v1/dashboard/state")).toBe(false);
  });

  it("recognizes owner bootstrap separately", () => {
    expect(isOwnerSetupSurface("/setup/owner")).toBe(true);
    expect(isOwnerSetupSurface("/api/v1/setup/owner")).toBe(true);
    expect(isOwnerSetupSurface("/login")).toBe(false);
  });

  it("rejects cross-origin mutations when Origin is present", () => {
    const request = new Request("https://frezen.example/api/v1/products", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(sameOriginMutation(request)).toBe(false);
  });

  it("adds browser isolation headers", async () => {
    const response = applySecurityHeaders(new Response("ok", {
      headers: { "content-type": "text/html; charset=utf-8" },
    }));
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
});
