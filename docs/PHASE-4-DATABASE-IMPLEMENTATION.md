# Phase 4 — Database Implementation

## Status

Implementation prepared on branch `phase-4-database`. This phase is **not complete until CI and D1 verification pass**.

## What was added

- `worker/migrations/0001_phase4_database.sql`
  - Creates the Phase 4 application schema.
  - Adds foreign keys, uniqueness constraints, status checks, timestamps and indexes.
  - Adds a partial unique index so one script cannot have multiple ACTIVE versions.
- `worker/migrations/0002_phase4_migration_metadata.sql`
  - Adds application-level migration metadata for auditability.

## Tables

- users
- sessions
- invites
- products
- licenses
- scripts
- script_versions
- devices
- discord_accounts
- claims
- audit_logs
- security_events
- api_keys
- notifications
- settings
- frezen_migration_metadata

## Important distinction: D1 migration history

Cloudflare Wrangler/D1 owns the actual migration history used for deployment. The `frezen_migration_metadata` table is **not** a replacement for Wrangler's migration tracking; it is application-level metadata only.

Do not manually create or alter Wrangler's internal migration bookkeeping table. This avoids the `no such table: d1_migrations` class of error that can occur when application code assumes an internal table exists before Wrangler has initialized/managed it.

## Applying locally

From the repository root:

```text
cd worker
npm install
npx wrangler d1 migrations apply frezen-production --local
```

Use the actual D1 database name configured for the target environment. Never point a local test at production accidentally.

## Staging / production

Before applying a remote migration, verify the target D1 database and environment. Then use Wrangler's supported migration command for the configured environment rather than manually pasting schema SQL into an unrelated table.

Example pattern:

```text
cd worker
npx wrangler d1 migrations apply <DATABASE_NAME> --remote --env staging
```

Production should only be migrated after staging verification and an appropriate backup/recovery plan.

## Verification SQL

After applying the migration, verify the application tables with:

```sql
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name;
```

Verify indexes with:

```sql
SELECT name, tbl_name
FROM sqlite_master
WHERE type = 'index'
ORDER BY name;
```

Verify the application migration metadata:

```sql
SELECT migration_id, description, applied_at
FROM frezen_migration_metadata
ORDER BY applied_at;
```

## Smoke test

The migration should support a transaction-safe basic write/read cycle using test data in a non-production database. Do not insert real user passwords, license secrets, API keys or production identities into test data.

## Security notes

- Passwords are represented by `password_hash`, never plaintext.
- License values are represented by `key_hash`, not a plaintext reusable key.
- Session credentials are represented by `token_hash`.
- API credentials are represented by `key_hash`.
- HWID values are represented by `hwid_hash` in the device table.
- No secret is embedded in this migration.
- Uploaded Lua remains file data; this schema does not execute it.

## Scope boundary

Phase 4 establishes the D1 schema. It does not claim that every Phase 5–45 feature is implemented. Existing endpoints and future phases must consume this schema through server-side authorization.

## Next phase

After this PR passes and is merged, the next implementation target is **Phase 5 — Authentication**.
