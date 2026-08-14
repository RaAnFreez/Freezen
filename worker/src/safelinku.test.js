import { describe, expect, it, vi } from "vitest";
import { safelinkuConfigStatus, testSafeLinkUConnection } from "./safelinku.js";

describe("SafeLinkU configuration", () => {
  it("fails closed for non-HTTPS provider URLs", () => {
    expect(safelinkuConfigStatus({
      SAFELINKU_API_KEY: "test-key",
      SAFELINKU_API_BASE_URL: "http://provider.example",
    })).toEqual({
      configured: false,
      api_key_configured: true,
      base_url_configured: false,
      base_url: null,
    });
  });

  it("does not expose provider credentials in config status", () => {
    const status = safelinkuConfigStatus({
      SAFELINKU_API_KEY: "super-secret",
      SAFELINKU_API_BASE_URL: "https://provider.example/api",
    });
    expect(status.api_key).toBeUndefined();
    expect(status.base_url).toBe("https://provider.example");
  });

  it("records a failed connection without leaking the API key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const result = await testSafeLinkUConnection({
      SAFELINKU_API_KEY: "super-secret",
      SAFELINKU_API_BASE_URL: "https://provider.example/api",
    });
    expect(result).toEqual({
      status: "error",
      http_status: 401,
      configured: true,
      error: null,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, options] = fetch.mock.calls[0];
    expect(options.headers.authorization).toBe("Bearer super-secret");
  });
});
