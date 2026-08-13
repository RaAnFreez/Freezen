-- Frezen Control System V3
-- Final owner-setup schema guard.
-- This migration is additive and safe for a production database that has
-- already completed the authentication reconciliation.

PRAGMA foreign_keys = ON;

-- Ensure the canonical authentication columns exist for the Owner setup
-- endpoint. The preceding reconciliation migration creates these columns
-- when the legacy users table is present.
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_owner_setup
  ON users(email)
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username_owner_setup
  ON users(username)
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_role_owner_setup
  ON users(role);
