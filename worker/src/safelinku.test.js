import { describe, expect, it, vi } from "vitest";
import { createSafeLinkUShortLink, safelinkuConfigStatus, testSafeLinkUConnection } from "./safelinku.js";

describe("SafeLinkU API integration", () => {
  it("reports config status with the default API base", () => {
    const status = safelinkuConfigStatus({ SAFELINKU_API_KEY: "super-secret" });
    expect(status).toEqual({
      configured: true,
      api_key_configured: true,
      endpoint: "https://safelinku.com/api",
    });
  });

  it("honors a custom SAFELINKU_API_BASE_URL when configured", () => {
    const status = safelinkuConfigStatus({
      SAFELINKU_API_KEY: "super-secret",
      SAFELINKU_API_BASE_URL: "https://safelinku.example/api",
    });
    expect(status.endpoint).toBe("https://safelinku.example/api");
  });

  it("creates a SafeLinkU short link via a GET request with the token and url as query params", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => "https://safelinku.com/abc123",
    }));
    const result = await createSafeLinkUShortLink(
      { SAFELINKU_API_KEY: "super-secret" },
      "https://example.com/flow",
      { alias: "my-alias" },
    );
    expect(result).toEqual({
      status: "ok",
      http_status: 200,
      configured: true,
      url: "https://safelinku.com/abc123",
      error: null,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetch.mock.calls[0];
    expect(options.method).toBe("GET");
    expect(options.body).toBeUndefined();
    const parsed = new URL(calledUrl);
    expect(parsed.origin + parsed.pathname).toBe("https://safelinku.com/api");
    expect(parsed.searchParams.get("api")).toBe("super-secret");
    expect(parsed.searchParams.get("url")).toBe("https://example.com/flow");
    expect(parsed.searchParams.get("alias")).toBe("my-alias");
    expect(parsed.searchParams.get("format")).toBe("text");
    expect(JSON.stringify(result)).not.toContain("super-secret");
  });

  it("treats an empty response body as a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => "",
    }));
    const result = await createSafeLinkUShortLink(
      { SAFELINKU_API_KEY: "bad-key" },
      "https://example.com/flow",
    );
    expect(result.status).toBe("error");
    expect(result.url).toBeNull();
  });

  it("treats a non-URL response body as a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => "Invalid API token",
    }));
    const result = await createSafeLinkUShortLink(
      { SAFELINKU_API_KEY: "bad-key" },
      "https://example.com/flow",
    );
    expect(result.status).toBe("error");
    expect(result.url).toBeNull();
  });

  it("treats non-2xx HTTP responses as failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      text: async () => "",
    }));
    const result = await createSafeLinkUShortLink(
      { SAFELINKU_API_KEY: "bad-key" },
      "https://example.com/flow",
    );
    expect(result.status).toBe("error");
    expect(result.http_status).toBe(401);
    expect(result.url).toBeNull();
  });

  it("returns not_configured without calling fetch when no API key is set", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await createSafeLinkUShortLink({}, "https://example.com/flow");
    expect(result.status).toBe("not_configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("runs the real connection test through the same link creation path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => "https://safelinku.com/test",
    }));
    const result = await testSafeLinkUConnection({ SAFELINKU_API_KEY: "super-secret" });
    expect(result.status).toBe("ok");
    expect(result.url).toBe("https://safelinku.com/test");
  });
});
