-- Phase 14 license lifecycle schema reconciliation.
-- The original Phase 4 migration set is intentionally preserved; this migration
-- upgrades the earlier minimal licenses table without storing plaintext keys.
--
-- IMPORTANT: 0001_phase4_database.sql uses `key_hash` and a NOT NULL
-- `product_id`. The Phase 14 table becomes the canonical schema, so the
-- legacy hash is copied into the canonical `key_hash` column and product_id
-- is preserved when present. This keeps the migration chain compatible with
-- the actual production foundation schema.

PRAGMA foreign_keys = OFF;

CREATE TABLE licenses_phase14 (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  product_id TEXT,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'UNUSED' CHECK (status IN ('UNUSED','ACTIVE','EXPIRED','REVOKED','BANNED')),
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
  key_hash,
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
  key_hash,
  product_id,
  user_id,
  CASE UPPER(status)
    WHEN 'ACTIVE' THEN 'ACTIVE'
    WHEN 'REVOKED' THEN 'REVOKED'
    WHEN 'EXPIRED' THEN 'EXPIRED'
    WHEN 'BANNED' THEN 'BANNED'
    ELSE 'UNUSED'
  END,
  created_at,
  COALESCE(updated_at, created_at),
  expires_at,
  COALESCE(max_devices, 1),
  current_hwid,
  discord_user_id,
  last_seen,
  COALESCE(redeem_count, 0),
  COALESCE(reset_count, 0)
FROM licenses;

DROP TABLE licenses;
ALTER TABLE licenses_phase14 RENAME TO licenses;

CREATE INDEX IF NOT EXISTS idx_licenses_product_status ON licenses(product_id, status);
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON licenses(expires_at);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

PRAGMA foreign_keys = ON;