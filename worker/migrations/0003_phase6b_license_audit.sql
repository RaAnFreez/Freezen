PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS license_audit_log (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_license_audit_license_id
  ON license_audit_log(license_id, changed_at);
