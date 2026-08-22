import { describe, expect, it, vi } from "vitest";
import { safelinkuConfigStatus, testSafeLinkUConnection, createClaim, getSafeLinkUStats } from "../src/safelinku.js";

describe("Phase 21 SafeLinkU integration", () => {
  it("requires an API key for the documented SafeLinkU POST API", () => {
    expect(safelinkuConfigStatus({})).toMatchObject({ configured: false, api_key_configured: false });
    expect(safelinkuConfigStatus({ SAFELINKU_API_KEY: "secret" })).toMatchObject({
      configured: true,
      api_key_configured: true,
      endpoint: "https://safelinku.com/api/v1/links",
      method: "POST",
    });
  });

  it("uses a configured SAFELINKU_API_BASE_URL as the request endpoint", () => {
    expect(safelinkuConfigStatus({ SAFELINKU_API_KEY: "secret", SAFELINKU_API_BASE_URL: "https://provider.example/api/v1/links" }))
      .toMatchObject({ configured: true, endpoint: "https://provider.example/api/v1/links", method: "POST" });
    expect(safelinkuConfigStatus({ SAFELINKU_API_KEY: "secret", SAFELINKU_API_BASE_URL: "http://example.test" }))
      .toMatchObject({ endpoint: "https://safelinku.com/api/v1/links" });
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

  it("uses the provider secret server-side as Bearer auth against the real link creation API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ url: "https://safelinku.com/test" }),
      { status: 201, headers: { "content-type": "application/json" } },
    ));
    const result = await testSafeLinkUConnection({ SAFELINKU_API_KEY: "TOP_SECRET" });
    expect(result).toMatchObject({ status: "ok", http_status: 201, url: "https://safelinku.com/test" });

    const [calledUrl, options] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("https://safelinku.com/api/v1/links");
    expect(options.method).toBe("POST");
    expect(options.headers.authorization).toBe("Bearer TOP_SECRET");
    expect(options.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toMatchObject({ url: expect.stringMatching(/^https:\/\//) });
    expect(JSON.stringify(result)).not.toContain("TOP_SECRET");
    fetchSpy.mockRestore();
  });

  it("does not invent or fake a claim/checkpoint response", async () => {
    const result = await createClaim({}, "request-1");
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
