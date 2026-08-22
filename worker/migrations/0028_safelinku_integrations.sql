PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS safelinku_integrations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_safelinku_integrations_owner
  ON safelinku_integrations(owner_id, active, updated_at);

ALTER TABLE frezen_key_checkpoints ADD COLUMN safelinku_integration_id TEXT;

CREATE INDEX IF NOT EXISTS idx_key_checkpoints_safelinku_integration
  ON frezen_key_checkpoints(safelinku_integration_id, active);
