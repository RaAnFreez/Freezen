import { describe, expect, it } from "vitest";
import { ROLES, ROLE_PERMISSIONS, hasPermission, normalizeRole, requirePermission, roleMatrix } from "../src/security/roles.js";

describe("Phase 10 — roles and permissions", () => {
  it("defines only OWNER, ADMIN, and SUPPORT", () => {
    expect(ROLES).toEqual({ OWNER: "OWNER", ADMIN: "ADMIN", SUPPORT: "SUPPORT" });
  });

  it("gives OWNER full access", () => {
    expect(hasPermission("OWNER", "anything:read")).toBe(true);
    expect(hasPermission("owner", "scripts:write")).toBe(true);
  });

  it("gives ADMIN the required management permissions", () => {
    expect(hasPermission("ADMIN", "licenses:read")).toBe(true);
    expect(hasPermission("ADMIN", "licenses:write")).toBe(true);
    expect(hasPermission("ADMIN", "products:write")).toBe(true);
    expect(hasPermission("ADMIN", "scripts:write")).toBe(true);
    expect(hasPermission("ADMIN", "users:write")).toBe(true);
    expect(hasPermission("ADMIN", "hwid:write")).toBe(true);
    expect(hasPermission("ADMIN", "analytics:read")).toBe(true);
    expect(hasPermission("ADMIN", "security:write")).toBe(false);
  });

  it("limits SUPPORT to users, licenses, and HWID", () => {
    expect(hasPermission("SUPPORT", "users:read")).toBe(true);
    expect(hasPermission("SUPPORT", "licenses:read")).toBe(true);
    expect(hasPermission("SUPPORT", "hwid:read")).toBe(true);
    expect(hasPermission("SUPPORT", "hwid:write")).toBe(true);
    expect(hasPermission("SUPPORT", "licenses:write")).toBe(false);
    expect(hasPermission("SUPPORT", "scripts:read")).toBe(false);
    expect(hasPermission("SUPPORT", "users:write")).toBe(false);
  });

  it("denies unknown or client-invented roles", () => {
    expect(normalizeRole("owner")).toBe("OWNER");
    expect(hasPermission("SUPERADMIN", "*")).toBe(false);
    expect(hasPermission("OWNER' OR 1=1", "licenses:write")).toBe(false);
  });

  it("returns a serializable server-defined matrix", () => {
    expect(roleMatrix()).toEqual(ROLE_PERMISSIONS);
  });

  it("returns 401 without an authenticated account and 403 without permission", async () => {
    const json = (data, status) => new Response(JSON.stringify(data), { status });
    const requestId = "phase-10-test";
    expect(requirePermission(null, "users:read", json, requestId).status).toBe(401);
    expect(requirePermission({ user_id: "u1", role: "SUPPORT" }, "scripts:read", json, requestId).status).toBe(403);
    expect(requirePermission({ user_id: "u1", role: "ADMIN" }, "scripts:read", json, requestId)).toBeNull();
  });
});
