-- Phase 14 license lifecycle schema.
-- This migration is kept unchanged from the stable pre-error baseline.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS licenses_phase14 (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'UNUSED'
    CHECK (status IN ('UNUSED','ACTIVE','EXPIRED','REVOKED','BANNED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

INSERT OR IGNORE INTO licenses_phase14 (
  id, key_hash, product_id, user_id, status, created_at, expires_at,
  max_devices, current_hwid, discord_user_id, last_seen, redeem_count, reset_count
)
SELECT
  l.id,
  l.license_key_hash,
  p.id,
  l.user_id,
  CASE LOWER(l.status)
    WHEN 'active' THEN 'ACTIVE'
    WHEN 'revoked' THEN 'REVOKED'
    WHEN 'expired' THEN 'EXPIRED'
    ELSE 'UNUSED'
  END,
  l.created_at,
  l.expires_at,
  1,
  NULL,
  NULL,
  NULL,
  0,
  0
FROM licenses l
JOIN products p ON p.id = (SELECT id FROM products ORDER BY created_at, id LIMIT 1);

DROP TABLE IF EXISTS licenses;
ALTER TABLE licenses_phase14 RENAME TO licenses;

CREATE INDEX IF NOT EXISTS idx_licenses_product_status ON licenses(product_id, status);
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON licenses(expires_at);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

PRAGMA foreign_keys = ON;