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
  '5f6c6f65f6d7a0b4c2a1d7b6e9c3e8b2b8c6f6c7f1e0a6c0b5f0f9a3d6c7b8e9',
  'active',
  NULL
);
