-- Phase 5B: deterministic demo license for production validation testing.
-- The application stores license keys as SHA-256 hashes.
-- This migration inserts only the hash, never the plaintext key.

INSERT OR IGNORE INTO users (
  id,
  external_id,
  display_name
) VALUES (
  'phase5b-demo-user',
  'phase5b-demo-external',
  'Phase 5B Demo User'
);

INSERT OR IGNORE INTO licenses (
  id,
  user_id,
  license_key_hash,
  status,
  expires_at
) VALUES (
  'phase5b-demo-license',
  'phase5b-demo-user',
  '53e72824143d4b0084cecd2e93570929738ceba2eb7600fa69c927fba0fba332',
  'active',
  NULL
);
