-- Rebuild the public GetKey flow around the checkpoint-system.zip reference model.
-- Existing production D1 is preserved; these are additive tables only.

CREATE TABLE IF NOT EXISTS getkey_public_sessions (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  issued_license_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_getkey_public_sessions_service
  ON getkey_public_sessions(service_id, last_seen_at);

CREATE INDEX IF NOT EXISTS idx_getkey_public_sessions_expires
  ON getkey_public_sessions(expires_at);

CREATE TABLE IF NOT EXISTS getkey_public_checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  checkpoint_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  verify_token_hash TEXT,
  token_expires_at TEXT,
  short_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT,
  verify_ip TEXT,
  FOREIGN KEY (session_id) REFERENCES getkey_public_sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, step_index)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_getkey_public_checkpoint_token
  ON getkey_public_checkpoints(verify_token_hash)
  WHERE verify_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_getkey_public_checkpoint_session
  ON getkey_public_checkpoints(session_id, step_index);

CREATE TABLE IF NOT EXISTS getkey_public_keys (
  session_id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL UNIQUE,
  key_ciphertext TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES getkey_public_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_getkey_public_keys_license
  ON getkey_public_keys(license_id);
