import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../migrations/0004_phase14_license_system.sql", import.meta.url), "utf8");

describe("Phase 14 license schema", () => {
  it("contains the lifecycle fields and required states", () => {
    // Phase 14 canonicalizes the historical license_key_hash column into
    // key_hash while preserving the old value during the data copy.
    expect(migration).toContain("key_hash TEXT NOT NULL UNIQUE");
    expect(migration).toContain("product_id TEXT");
    expect(migration).toContain("max_devices INTEGER NOT NULL DEFAULT 1");
    expect(migration).toContain("current_hwid TEXT");
    expect(migration).toContain("redeem_count INTEGER NOT NULL DEFAULT 0");
    expect(migration).toContain("reset_count INTEGER NOT NULL DEFAULT 0");
    expect(migration).toContain("'UNUSED','ACTIVE','EXPIRED','REVOKED','BANNED'");
    expect(migration).toContain("license_key_hash");
  });

  it("does not introduce plaintext license-key storage", () => {
    expect(migration).not.toContain("license_key TEXT");
    expect(migration).not.toContain("license_plaintext");
  });
});
