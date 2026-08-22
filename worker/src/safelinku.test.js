import { describe, expect, it, vi } from "vitest";
import { createSafeLinkUShortLink, safelinkuConfigStatus, testSafeLinkUConnection } from "./safelinku.js";

describe("SafeLinkU API integration", () => {
  it("reports config status with the documented API endpoint", () => {
    const status = safelinkuConfigStatus({ SAFELINKU_API_KEY: "super-secret" });
    expect(status).toEqual({
      configured: true,
      api_key_configured: true,
      endpoint: "https://safelinku.com/api/v1/links",
      method: "POST",
    });
  });

  it("honors a custom SAFELINKU_API_BASE_URL when configured", () => {
    const status = safelinkuConfigStatus({
      SAFELINKU_API_KEY: "super-secret",
      SAFELINKU_API_BASE_URL: "https://safelinku.example/api/v1/links",
    });
    expect(status.endpoint).toBe("https://safelinku.example/api/v1/links");
  });

  it("creates a SafeLinkU short link using POST Bearer auth and JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      text: async () => JSON.stringify({ url: "https://safelinku.com/abc123" }),
    }));
    const result = await createSafeLinkUShortLink(
      { SAFELINKU_API_KEY: "super-secret" },
      "https://example.com/flow",
      { alias: "my-alias", passcode: "link-password" },
    );
    expect(result).toEqual({
      status: "ok",
      http_status: 201,
      configured: true,
      url: "https://safelinku.com/abc123",
      error: null,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetch.mock.calls[0];
    expect(calledUrl).toBe("https://safelinku.com/api/v1/links");
    expect(options.method).toBe("POST");
    expect(options.headers.accept).toBe("application/json");
    expect(options.headers.authorization).toBe("Bearer super-secret");
    expect(options.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({
      url: "https://example.com/flow",
      alias: "my-alias",
      passcode: "link-password",
    });
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

  it("treats a non-API response body as a failure without leaking raw HTML", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 403,
      ok: false,
      text: async () => "<!DOCTYPE html><html><title>Attention Required | Cloudflare</title></html>",
    }));
    const result = await createSafeLinkUShortLink(
      { SAFELINKU_API_KEY: "bad-key" },
      "https://example.com/flow",
    );
    expect(result.status).toBe("error");
    expect(result.error).toBe("SAFELINKU_NON_API_RESPONSE_HTTP_403");
    expect(result.error).not.toContain("DOCTYPE");
  });

  it("extracts a JSON API error without exposing the bearer token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      text: async () => JSON.stringify({ error: "Unauthorized" }),
    }));
    const result = await createSafeLinkUShortLink(
      { SAFELINKU_API_KEY: "bad-key" },
      "https://example.com/flow",
    );
    expect(result.status).toBe("error");
    expect(result.http_status).toBe(401);
    expect(result.error).toBe("Unauthorized");
    expect(JSON.stringify(result)).not.toContain("bad-key");
  });

  it("returns not_configured without calling fetch when no API key is set", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await createSafeLinkUShortLink({}, "https://example.com/flow");
    expect(result.status).toBe("not_configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("runs the real connection test through the same link creation path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      text: async () => JSON.stringify({ url: "https://safelinku.com/test" }),
    }));
    const result = await testSafeLinkUConnection({ SAFELINKU_API_KEY: "super-secret" });
    expect(result.status).toBe("ok");
    expect(result.url).toBe("https://safelinku.com/test");
  });
});
