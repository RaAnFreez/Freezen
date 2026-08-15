CREATE TABLE IF NOT EXISTS frezen_key_services (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  premium INTEGER NOT NULL DEFAULT 0,
  keyless INTEGER NOT NULL DEFAULT 0,
  keyless_days_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS frezen_key_service_aliases (
  slug TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (service_id) REFERENCES frezen_key_services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS frezen_key_providers (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'safelinku',
  active INTEGER NOT NULL DEFAULT 1,
  checkpoints_json TEXT NOT NULL DEFAULT '[]',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (service_id) REFERENCES frezen_key_services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS frezen_key_checkpoints (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'safelinku',
  url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frezen_key_services_slug ON frezen_key_services(slug);
CREATE INDEX IF NOT EXISTS idx_frezen_key_service_aliases_service ON frezen_key_service_aliases(service_id);
CREATE INDEX IF NOT EXISTS idx_frezen_key_providers_service ON frezen_key_providers(service_id, active);
CREATE INDEX IF NOT EXISTS idx_frezen_key_checkpoints_active ON frezen_key_checkpoints(active);
