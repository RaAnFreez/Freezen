-- Phase 17: Lua Script Manager storage.
-- Uploaded Lua is stored as data only. The Worker never executes or evals it.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS script_files (
  id TEXT PRIMARY KEY,
  script_version_id TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text/x-lua',
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 524288),
  content TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_script_files_version ON script_files(script_version_id);
