PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  user_id TEXT,
  action TEXT,
  resource_type TEXT,
  resource_id TEXT,
  request_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_security_events_created_at
  ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id
  ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type
  ON security_events(event_type, created_at DESC);
