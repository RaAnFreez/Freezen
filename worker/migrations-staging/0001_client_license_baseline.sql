-- Staging-only baseline for the Frezen client-license validation API.
-- This directory is selected only by the staging D1 binding in wrangler.toml.
-- It intentionally does not import production data or replay the legacy migration
-- chain, whose historical files contain duplicate version prefixes.
-- This is a narrow staging schema, not the full dashboard schema.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT COLLATE NOCASE,
  external_id TEXT UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  version TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (LOWER(status) IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  license_key_hash TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'unused'
    CHECK (LOWER(status) IN ('unused', 'active', 'expired', 'revoked', 'banned')),
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

CREATE INDEX IF NOT EXISTS idx_staging_licenses_product_status
  ON licenses(product_id, status);
CREATE INDEX IF NOT EXISTS idx_staging_licenses_expiry
  ON licenses(expires_at);

-- These two narrow compatibility tables are read by HWID v2's existing
-- max-device and owner lookup queries. They do not contain production data.
CREATE TABLE IF NOT EXISTS frezen_key_records (
  id TEXT PRIMARY KEY,
  license_id TEXT,
  owner_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_staging_key_records_license
  ON frezen_key_records(license_id);

CREATE TABLE IF NOT EXISTS frezen_key_limits (
  id TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  max_devices INTEGER NOT NULL CHECK (max_devices > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (key_id) REFERENCES frezen_key_records(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_staging_key_limits_key
  ON frezen_key_limits(key_id);

CREATE TABLE IF NOT EXISTS hwid_bindings_v2 (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  license_id TEXT NOT NULL,
  hwid_hash TEXT NOT NULL,
  game_username TEXT,
  game_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (LOWER(status) IN ('active', 'blocked')),
  first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  blocked_at TEXT,
  blocked_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (license_id, hwid_hash),
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staging_hwid_owner_status
  ON hwid_bindings_v2(owner_id, status, last_seen);
CREATE INDEX IF NOT EXISTS idx_staging_hwid_license_status
  ON hwid_bindings_v2(license_id, status, last_seen);
CREATE INDEX IF NOT EXISTS idx_staging_hwid_hash
  ON hwid_bindings_v2(hwid_hash);
