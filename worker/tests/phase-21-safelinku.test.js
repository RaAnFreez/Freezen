import { describe, expect, it, vi } from "vitest";
import { safelinkuConfigStatus, testSafeLinkUConnection, createClaim, getSafeLinkUStats } from "../src/safelinku.js";

describe("Phase 21 SafeLinkU integration", () => {
  it("does not report configured without both API secret and HTTPS base URL", () => {
    expect(safelinkuConfigStatus({})).toMatchObject({ configured: false, api_key_configured: false, base_url_configured: false });
    expect(safelinkuConfigStatus({ SAFELINKU_API_KEY: "secret" })).toMatchObject({ configured: false, api_key_configured: true, base_url_configured: false });
    expect(safelinkuConfigStatus({ SAFELINKU_API_KEY: "secret", SAFELINKU_API_BASE_URL: "http://example.test" })).toMatchObject({ configured: false, base_url_configured: false });
  });

  it("accepts only an HTTPS provider base URL", () => {
    expect(safelinkuConfigStatus({ SAFELINKU_API_KEY: "secret", SAFELINKU_API_BASE_URL: "https://provider.example" })).toMatchObject({ configured: true, base_url: "https://provider.example" });
  });

  it("does not expose the API key in configuration status", () => {
    const status = safelinkuConfigStatus({ SAFELINKU_API_KEY: "TOP_SECRET", SAFELINKU_API_BASE_URL: "https://provider.example" });
    expect(JSON.stringify(status)).not.toContain("TOP_SECRET");
  });

  it("returns not_configured without making a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await testSafeLinkUConnection({});
    expect(result.status).toBe("not_configured");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("uses the provider secret server-side for a configured connection", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const result = await testSafeLinkUConnection({ SAFELINKU_API_KEY: "TOP_SECRET", SAFELINKU_API_BASE_URL: "https://provider.example" });
    expect(result).toMatchObject({ status: "ok", http_status: 200 });
    expect(fetchSpy.mock.calls[0][1].headers.authorization).toBe("Bearer TOP_SECRET");
    fetchSpy.mockRestore();
  });

  it("does not invent or fake a claim/checkpoint response", async () => {
    const result = await createClaim({}, "request-1", { product_id: "p1" });
    expect(result).toMatchObject({ ok: false, status: 501, error: "SAFELINKU_CLAIM_ENDPOINT_NOT_CONFIGURED" });
  });

  it("reads isolated provider telemetry", async () => {
    const db = { prepare: vi.fn(() => ({ all: vi.fn(async () => ({ results: [
      { outcome: "success", request_id: "r1", created_at: "2026-01-01 00:00:00" },
      { outcome: "failed", request_id: "r2", created_at: "2026-01-01 00:01:00" },
    ] })) })) };
    await expect(getSafeLinkUStats({ DB: db })).resolves.toEqual({
      successful_claims: 1,
      failed_claims: 1,
      last_request: { request_id: "r1", created_at: "2026-01-01 00:00:00", status: "success" },
    });
  });
});
