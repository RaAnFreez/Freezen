-- Phase 16 HWID/device management.
-- Store only a SHA-256 HWID hash; never persist the raw client HWID.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  user_id TEXT,
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
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE licenses ADD COLUMN hwid_reset_at TEXT;
ALTER TABLE licenses ADD COLUMN hwid_reset_cooldown_until TEXT;

CREATE INDEX IF NOT EXISTS idx_devices_license_status ON devices(license_id, status);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_hwid_hash ON devices(hwid_hash);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
