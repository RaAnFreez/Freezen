-- Frezen Control System V3
-- Reconcile the legacy 0001_initial users table with the Phase 4/5
-- authentication schema. The original users table used external_id and
-- display_name, so the later CREATE TABLE IF NOT EXISTS users statement
-- could not replace it. Add the authentication columns in-place instead.
-- This migration is intentionally additive and preserves existing records.

PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE;
ALTER TABLE users ADD COLUMN username TEXT COLLATE NOCASE;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'SUPPORT';
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN last_login_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_reconciled
  ON users(email)
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username_reconciled
  ON users(username)
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_role_reconciled ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status_reconciled ON users(status);
