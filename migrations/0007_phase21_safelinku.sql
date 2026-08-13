-- Phase 21: provider telemetry only. No provider secret is stored here.
CREATE TABLE IF NOT EXISTS safelinku_events (
  id TEXT PRIMARY KEY,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failed')),
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_safelinku_events_created_at
  ON safelinku_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_safelinku_events_outcome
  ON safelinku_events(outcome, created_at DESC);
