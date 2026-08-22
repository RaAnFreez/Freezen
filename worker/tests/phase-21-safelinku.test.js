import { describe, expect, it, vi } from "vitest";
import { safelinkuConfigStatus, testSafeLinkUConnection, createClaim, getSafeLinkUStats } from "../src/safelinku.js";

describe("Phase 21 SafeLinkU integration", () => {
  it("requires an API key for the real SafeLinkU query-param API", () => {
    expect(safelinkuConfigStatus({})).toMatchObject({ configured: false, api_key_configured: false });
    expect(safelinkuConfigStatus({ SAFELINKU_API_KEY: "secret" })).toMatchObject({
      configured: true,
      api_key_configured: true,
      endpoint: "https://safelinku.com/api",
    });
  });

  it("uses a configured SAFELINKU_API_BASE_URL as the real request endpoint", () => {
    expect(safelinkuConfigStatus({ SAFELINKU_API_KEY: "secret", SAFELINKU_API_BASE_URL: "https://provider.example/api" }))
      .toMatchObject({ configured: true, endpoint: "https://provider.example/api" });
    expect(safelinkuConfigStatus({ SAFELINKU_API_KEY: "secret", SAFELINKU_API_BASE_URL: "http://example.test" }))
      .toMatchObject({ endpoint: "https://safelinku.com/api" });
  });

  it("does not expose the API key in configuration status", () => {
    const status = safelinkuConfigStatus({ SAFELINKU_API_KEY: "TOP_SECRET" });
    expect(JSON.stringify(status)).not.toContain("TOP_SECRET");
  });

  it("returns not_configured without making a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await testSafeLinkUConnection({});
    expect(result.status).toBe("not_configured");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("uses the provider secret server-side as a query param against the real link creation API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      "https://safelinku.com/test",
      { status: 200, headers: { "content-type": "text/plain" } },
    ));
    const result = await testSafeLinkUConnection({ SAFELINKU_API_KEY: "TOP_SECRET" });
    expect(result).toMatchObject({ status: "ok", http_status: 200, url: "https://safelinku.com/test" });

    const [calledUrl, options] = fetchSpy.mock.calls[0];
    expect(options.method).toBe("GET");
    expect(options.body).toBeUndefined();
    const parsed = new URL(calledUrl);
    expect(parsed.origin + parsed.pathname).toBe("https://safelinku.com/api");
    expect(parsed.searchParams.get("api")).toBe("TOP_SECRET");
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
