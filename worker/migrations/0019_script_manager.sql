CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  loader_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(service_id, name),
  FOREIGN KEY(service_id) REFERENCES frezen_key_services(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_scripts_service ON scripts(service_id);
CREATE INDEX IF NOT EXISTS idx_scripts_status ON scripts(status);

CREATE TABLE IF NOT EXISTS script_versions (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL,
  version TEXT NOT NULL,
  file_reference TEXT NOT NULL,
  release_notes TEXT,
  status TEXT NOT NULL DEFAULT 'ARCHIVED' CHECK(status IN ('ACTIVE','ARCHIVED','DISABLED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(script_id, version),
  FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_script_versions_script ON script_versions(script_id, created_at DESC);

CREATE TABLE IF NOT EXISTS script_files (
  id TEXT PRIMARY KEY,
  script_version_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text/x-lua',
  size_bytes INTEGER NOT NULL,
  content TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(script_version_id),
  FOREIGN KEY(script_version_id) REFERENCES script_versions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_script_files_sha256 ON script_files(sha256);
