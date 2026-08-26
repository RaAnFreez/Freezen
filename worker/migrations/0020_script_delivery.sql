CREATE TABLE IF NOT EXISTS delivery_scripts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS idx_delivery_scripts_status ON delivery_scripts(status);

CREATE TABLE IF NOT EXISTS delivery_script_versions (
  id TEXT PRIMARY KEY,
  delivery_script_id TEXT NOT NULL,
  version TEXT NOT NULL,
  file_reference TEXT NOT NULL,
  release_notes TEXT,
  status TEXT NOT NULL DEFAULT 'ARCHIVED' CHECK(status IN ('ACTIVE','ARCHIVED','DISABLED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(delivery_script_id, version),
  FOREIGN KEY(delivery_script_id) REFERENCES delivery_scripts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_delivery_versions_script ON delivery_script_versions(delivery_script_id, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_script_files (
  id TEXT PRIMARY KEY,
  delivery_script_version_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text/x-lua',
  size_bytes INTEGER NOT NULL,
  content TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  obfuscation_version TEXT NOT NULL DEFAULT '1.1',
  obfuscation_strength TEXT NOT NULL DEFAULT 'VERY_HIGH',
  obfuscation_protection_level INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(delivery_script_version_id),
  FOREIGN KEY(delivery_script_version_id) REFERENCES delivery_script_versions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_delivery_files_sha256 ON delivery_script_files(sha256);
