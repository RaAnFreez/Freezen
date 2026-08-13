-- FREZEN CONTROL SYSTEM V3
-- Phase 5B test/provisioning foundation.
-- At this point in the ordered migration chain the historical
-- 0001_initial.sql licenses table is still authoritative. Phase 14 later
-- reconciles it into the canonical lifecycle schema.

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