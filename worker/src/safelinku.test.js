import { describe, expect, it, vi } from "vitest";
import { createSafeLinkUShortLink, safelinkuConfigStatus, testSafeLinkUConnection } from "./safelinku.js";

describe("SafeLinkU API integration", () => {
  it("uses the documented SafeLinkU links endpoint without exposing the API key", () => {
    const status = safelinkuConfigStatus({ SAFELINKU_API_KEY: "super-secret" });
    expect(status).toEqual({
      configured: true,
      api_key_configured: true,
      endpoint: "https://safelinku.com/api/v1/links",
    });
  });

  it("creates a SafeLinkU short link from the documented 2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ url: "https://safelinku.com/example" }),
    }));
    const result = await createSafeLinkUShortLink(
      { SAFELINKU_API_KEY: "super-secret" },
      "https://example.com/flow",
    );
    expect(result).toEqual({
      status: "ok",
      http_status: 201,
      configured: true,
      url: "https://safelinku.com/example",
      error: null,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://safelinku.com/api/v1/links",
      expect.objectContaining({ method: "POST" }),
    );
    const [, options] = fetch.mock.calls[0];
    expect(options.headers.authorization).toBe("Bearer super-secret");
    expect(options.body).toContain("https://example.com/flow");
  });

  it("treats unauthorized SafeLinkU API responses as failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({ message: "Unauthorized" }),
    }));
    const result = await createSafeLinkUShortLink(
      { SAFELINKU_API_KEY: "bad-key" },
      "https://example.com/flow",
    );
    expect(result.status).toBe("error");
    expect(result.http_status).toBe(401);
    expect(result.url).toBeNull();
  });

  it("runs the real connection test through the SafeLinkU link creation API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ url: "https://safelinku.com/test" }),
    }));
    const result = await testSafeLinkUConnection({ SAFELINKU_API_KEY: "super-secret" });
    expect(result.status).toBe("ok");
    expect(result.http_status).toBe(201);
    expect(result.url).toBe("https://safelinku.com/test");
  });
});
