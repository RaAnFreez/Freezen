import { describe, expect, it } from "vitest";
import { canonicalSeAction, handleSeCompat } from "./se-compat.js";

const response = (request, env) => handleSeCompat(request, env, "test-request");

describe("SE-to-Frezen compatibility route", () => {
  it("normalizes the operations supported by Frezen", () => {
    expect(canonicalSeAction("Create Key")).toBe("generate_key");
    expect(canonicalSeAction("ban-device")).toBe("ban_hwid");
    expect(canonicalSeAction("unblock_hwid")).toBe("unban_hwid");
    expect(canonicalSeAction("get_keys")).toBe("list_keys");
    expect(canonicalSeAction("Top Up")).toBe("topup");
  });

  it("fails closed while the bridge is disabled", async () => {
    const request = new Request("https://restfrezenapi1.frezen.my.id/api/request/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "status" }),
    });
    const result = await response(request, { FREZEN_SE_COMPAT_ENABLED: "false" });
    expect(result.status).toBe(404);
    expect((await result.json()).error).toBe("NOT_FOUND");
  });

  it("offers a status response without exposing credentials", async () => {
    const request = new Request("https://restfrezenapi1.frezen.my.id/api/request/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "status", token: "must-not-be-echoed" }),
    });
    const result = await response(request, { FREZEN_SE_COMPAT_ENABLED: "true" });
    const body = await result.json();
    expect(result.status).toBe(200);
    expect(body.server).toBe("Frezen");
    expect(body.topup).toBe("not_available");
    expect(JSON.stringify(body)).not.toContain("must-not-be-echoed");
  });

  it("does not fake top-up support", async () => {
    const request = new Request("https://restfrezenapi1.frezen.my.id/api/request/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "topup" }),
    });
    const result = await response(request, { FREZEN_SE_COMPAT_ENABLED: "true" });
    expect(result.status).toBe(501);
    expect((await result.json()).error).toBe("TOPUP_NOT_IMPLEMENTED");
  });

  it("requires a user-scoped API key for write operations", async () => {
    const request = new Request("https://restfrezenapi1.frezen.my.id/api/request/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "generate_key", product_id: "product-1" }),
    });
    const result = await response(request, { FREZEN_SE_COMPAT_ENABLED: "true", DB: {} });
    expect(result.status).toBe(401);
    expect((await result.json()).error).toBe("FREZEN_API_KEY_REQUIRED");
  });
});
