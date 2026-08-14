-- FREZEN CONTROL SYSTEM V3
-- Phase 14: reconcile the legacy api_keys table with the Phase 14 lifecycle schema.
-- The Phase 4 schema created api_keys with a different shape. Migration 0009
-- used CREATE TABLE IF NOT EXISTS, so it could not replace that legacy table.
-- Preserve the legacy table rather than silently dropping or rewriting its data.

PRAGMA foreign_keys = ON;

ALTER TABLE api_keys RENAME TO api_keys_legacy;

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_api_keys_owner
  ON api_keys(owner_user_id, created_at DESC);
CREATE INDEX idx_api_keys_prefix
  ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_expires
  ON api_keys(expires_at);
CREATE INDEX idx_api_keys_revoked
  ON api_keys(revoked_at);

-- Legacy rows remain available in api_keys_legacy for review/controlled migration.
-- They are not copied into the new owner-scoped table because the legacy schema
-- does not contain owner_user_id and assigning ownership would be unsafe.
