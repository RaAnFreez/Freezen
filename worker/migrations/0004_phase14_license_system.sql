-- Phase 14 license lifecycle schema reconciliation.
-- The original Phase 4 migration set is intentionally preserved; this migration
-- upgrades the earlier minimal licenses table without storing plaintext keys.

PRAGMA foreign_keys = OFF;

CREATE TABLE licenses_phase14 (
  id TEXT PRIMARY KEY,
  license_key_hash TEXT NOT NULL UNIQUE,
  product_id TEXT,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused','active','expired','revoked','banned')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  max_devices INTEGER NOT NULL DEFAULT 1 CHECK (max_devices > 0),
  current_hwid TEXT,
  discord_user_id TEXT,
  last_seen TEXT,
  redeem_count INTEGER NOT NULL DEFAULT 0 CHECK (redeem_count >= 0),
  reset_count INTEGER NOT NULL DEFAULT 0 CHECK (reset_count >= 0),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO licenses_phase14 (
  id,
  license_key_hash,
  product_id,
  user_id,
  status,
  created_at,
  updated_at,
  expires_at,
  max_devices,
  current_hwid,
  discord_user_id,
  last_seen,
  redeem_count,
  reset_count
)
SELECT
  id,
  license_key_hash,
  NULL,
  user_id,
  CASE LOWER(status)
    WHEN 'active' THEN 'active'
    WHEN 'revoked' THEN 'revoked'
    WHEN 'expired' THEN 'expired'
    ELSE 'unused'
  END,
  created_at,
  COALESCE(updated_at, created_at),
  expires_at,
  1,
  NULL,
  NULL,
  NULL,
  0,
  0
FROM licenses;

DROP TABLE licenses;
ALTER TABLE licenses_phase14 RENAME TO licenses;

CREATE INDEX IF NOT EXISTS idx_licenses_product_status ON licenses(product_id, status);
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON licenses(expires_at);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

PRAGMA foreign_keys = ON;