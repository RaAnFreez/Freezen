-- Frezen migration metadata for application-level migration auditing.
-- Wrangler/D1 migration tracking remains the deployment mechanism.
CREATE TABLE IF NOT EXISTS frezen_migration_metadata (
  migration_id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO frezen_migration_metadata (migration_id, description)
VALUES ('0001_phase4_database', 'Phase 4 foundational Frezen D1 schema');
