import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const scriptLoaderSource = readFileSync(new URL("../src/script-loader.js", import.meta.url), "utf8");
const runtimeHwidSource = readFileSync(new URL("../src/security/runtime-hwid.js", import.meta.url), "utf8");

describe("runtime HWID binding pipeline", () => {
  it("passes the license owner into the runtime HWID binding", () => {
    expect(scriptLoaderSource).toContain("l.user_id AS license_user_id");
    expect(scriptLoaderSource).toContain("bindRuntimeHwid(env, row.license_id, row.license_user_id, hwid)");
    expect(runtimeHwidSource).toContain("bindHwidV2(env, { licenseId, ownerId, rawHwid })");
  });

  it("requires a runtime HWID before protected Lua delivery", () => {
    expect(scriptLoaderSource).toContain('if (!hwid || hwid.length > 512) return deny("HWID_REQUIRED", 403, requestId);');
    expect(scriptLoaderSource).toContain('"x-frezen-hwid-bound": "true"');
    expect(scriptLoaderSource).toContain('"x-frezen-hwid-fingerprint": bound.fingerprint');
  });
});
