PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS api_keys (
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

CREATE INDEX IF NOT EXISTS idx_api_keys_owner
  ON api_keys(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix
  ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires
  ON api_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked
  ON api_keys(revoked_at);
