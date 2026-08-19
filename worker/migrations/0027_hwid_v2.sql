-- HWID V2: isolated device binding state.
-- Raw HWIDs are never stored; only SHA-256 hashes are persisted.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hwid_bindings_v2 (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  license_id TEXT NOT NULL,
  hwid_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
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

CREATE INDEX IF NOT EXISTS idx_hwid_v2_owner_status
  ON hwid_bindings_v2(owner_id, status, last_seen);

CREATE INDEX IF NOT EXISTS idx_hwid_v2_license_status
  ON hwid_bindings_v2(license_id, status, last_seen);

CREATE INDEX IF NOT EXISTS idx_hwid_v2_hash
  ON hwid_bindings_v2(hwid_hash);

CREATE INDEX IF NOT EXISTS idx_hwid_v2_last_seen
  ON hwid_bindings_v2(last_seen);
