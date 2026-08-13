-- Frezen Control System V3
-- Phase 5B test/provisioning foundation.
-- Creates a deterministic demo user/license for integration testing.
-- Demo license key: FREZEN-PHASE5B-DEMO
-- Only its SHA-256 hash is stored in D1.

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
  '53e72824143d4b0084cecd2e93570929738ceba2eb7600fa69c927fba0fba332',
  'active',
  NULL
);