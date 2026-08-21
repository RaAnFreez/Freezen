import { beforeEach, describe, expect, it, vi } from "vitest";

const bindHwidV2 = vi.fn();
const validateHwidV2 = vi.fn();
const resetHwidV2 = vi.fn();
const setHwidStatusV2 = vi.fn();

vi.mock("../src/security/hwid-v2.js", () => ({
  bindHwidV2,
  validateHwidV2,
  listHwidV2: vi.fn(),
  resetHwidV2,
  setHwidStatusV2,
}));

const { bindHwid, validateHwid } = await import("../src/security/hwid.js");

describe("HWID API Roblox identity propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bindHwidV2.mockResolvedValue({ ok: true, existing: false, deviceId: "device-1", fingerprint: "abc123" });
    validateHwidV2.mockResolvedValue({ ok: true, deviceId: "device-1", fingerprint: "abc123" });
  });

  it("passes game_username and game_user_id into bindHwidV2", async () => {
    const request = new Request("https://frezen.test/api/v1/hwid", {
      method: "POST",
      body: JSON.stringify({ license_id: "lic-1", hwid: "DEVICE-123", game_username: "TestPlayer", game_user_id: "123456" }),
      headers: { "content-type": "application/json" },
    });
    const response = await bindHwid(request, {}, "req-1", null, { user_id: "owner-1" });
    expect(response.status).toBe(201);
    expect(bindHwidV2).toHaveBeenCalledWith({}, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-123", gameUsername: "TestPlayer", gameUserId: "123456" });
  });

  it("passes identity through validation too", async () => {
    const request = new Request("https://frezen.test/api/v1/hwid/validate", {
      method: "POST",
      body: JSON.stringify({ license_id: "lic-1", hwid: "DEVICE-123", game_username: "TestPlayer", game_user_id: "123456" }),
      headers: { "content-type": "application/json" },
    });
    const response = await validateHwid(request, {}, "req-2", null, { user_id: "owner-1" });
    expect(response.status).toBe(200);
    expect(validateHwidV2).toHaveBeenCalledWith({}, { licenseId: "lic-1", ownerId: "owner-1", rawHwid: "DEVICE-123", gameUsername: "TestPlayer", gameUserId: "123456" });
  });
});
