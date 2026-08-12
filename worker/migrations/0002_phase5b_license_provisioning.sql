-- Frezen Control System V3
-- Phase 5B test/provisioning foundation.
-- Creates a deterministic demo user/license for integration testing.
-- The demo license key is represented only by its SHA-256 hash.

INSERT OR IGNORE INTO users (id, external_id, display_name)
VALUES ('demo-user-phase5b', 'demo-phase5b', 'Frezen Demo User');

INSERT OR IGNORE INTO licenses (
  id,
  user_id,
  license_key_hash,
  status,
  expires_at
)
VALUES (
  'demo-license-phase5b',
  'demo-user-phase5b',
  '9f7f8b2f6a4b5f0c0a4f9b7e5f6e1b3c2d1a0f9e8d7c6b5a4f3e2d1c0b9a8f7',
  'active',
  NULL
);
