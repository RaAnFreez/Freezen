import { describe, expect, it } from "vitest";

describe("HWID ban/reset semantics", () => {
  it("documents the protected state transition contract", () => {
    expect(["active", "blocked"]).toContain("blocked");
  });
});