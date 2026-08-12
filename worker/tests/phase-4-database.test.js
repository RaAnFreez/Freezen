import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0001_phase4_database.sql', import.meta.url), 'utf8');

const requiredTables = [
  'users', 'sessions', 'invites', 'products', 'licenses', 'scripts',
  'script_versions', 'devices', 'discord_accounts', 'claims', 'audit_logs',
  'security_events', 'api_keys', 'notifications', 'settings'
];

for (const table of requiredTables) {
  assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `missing table: ${table}`);
}

assert.match(migration, /password_hash TEXT/);
assert.match(migration, /token_hash TEXT NOT NULL UNIQUE/);
assert.match(migration, /key_hash TEXT NOT NULL UNIQUE/);
assert.match(migration, /hwid_hash TEXT NOT NULL/);
assert.match(migration, /PRAGMA foreign_keys = ON/);
assert.match(migration, /ux_script_versions_one_active/);
assert.match(migration, /WHERE status = 'ACTIVE'/);

// Migration must not contain obvious secret material.
assert.doesNotMatch(migration, /FREZEN_MASTER_SECRET\\s*=\\s*[^\\s]/i);
assert.doesNotMatch(migration, /DISCORD_BOT_TOKEN\\s*=\\s*[^\\s]/i);
assert.doesNotMatch(migration, /SAFELINKU_API_KEY\\s*=\\s*[^\\s]/i);

console.log('Phase 4 schema contract: passed');
