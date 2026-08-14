-- FREZEN CONTROL SYSTEM V3
-- Phase 14: API key lifecycle storage.
-- The original Phase 4 schema already created a legacy api_keys table with a
-- different shape. This migration is the first production application of the
-- Phase 14 key lifecycle schema, so preserve that legacy table rather than
-- attempting to ALTER it in-place or discard existing rows.

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

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

-- Rows from the legacy schema remain in api_keys_legacy. They are not copied
-- into the owner-scoped table because the legacy schema has no owner_user_id;
-- assigning them to an owner would be unsafe and could expose a key to the
-- wrong account. A future controlled migration can handle them explicitly.
