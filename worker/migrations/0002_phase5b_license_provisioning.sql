-- FREZEN CONTROL SYSTEM V3
-- Phase 5B test/provisioning foundation.
-- Creates a deterministic demo user/license for integration testing.
-- Only the SHA-256 hash is stored in D1.

-- The foundation schema uses the legacy external_id/display_name user fields
-- and key_hash license field. Keep this migration compatible with that schema.
INSERT OR IGNORE INTO users (id, external_id, display_name)
VALUES ('demo-user-phase5b', 'demo-phase5b', 'Frezen Demo User');

INSERT OR IGNORE INTO licenses (
  id,
  user_id,
  key_hash,
  product_id,
  status,
  expires_at
)
SELECT
  'demo-license-phase5b',
  'demo-user-phase5b',
  '53e72824143d4b0084cecd2e93570929738ceba2eb7600fa69c927fba0fba332',
  id,
  'ACTIVE',
  NULL
FROM products
ORDER BY id
LIMIT 1;