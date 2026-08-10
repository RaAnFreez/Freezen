# Frezen Control System V3 — Phase 4: D1 Foundation

## Goal

Introduce the first durable Cloudflare D1 data layer without putting credentials or database IDs in source control.

## Implemented

- Initial D1 migration at `worker/migrations/0001_initial.sql`.
- `users` table for external identities.
- `licenses` table with hashed license keys, status, optional expiry, and user ownership.
- Indexes for external IDs, license ownership, and status.
- Worker database health endpoint: `GET /api/v1/health/db`.
- Status endpoint now reports whether the `DB` binding is configured.
- Missing DB returns a controlled `503` instead of exposing an internal exception.

## Cloudflare setup

Create separate D1 databases for development, staging, and production. Do not reuse a production database for testing.

The repository intentionally does **not** contain real `database_id` values. After creating each D1 database, configure the `DB` binding in `worker/wrangler.toml` for the appropriate environment, then apply the migration with Wrangler.

Example commands (run from `worker/` after the database binding exists):

```bash
npx wrangler d1 migrations apply <database-name> --local
npx wrangler d1 migrations apply <database-name> --remote
```

Use the appropriate environment-specific database name for staging/production. Never put API tokens or other secrets into this file.

## API checks

`GET /api/v1/status`

- `200` when the Worker is healthy.
- `database` reports `configured` when `env.DB` exists.

`GET /api/v1/health/db`

- `200` when D1 is configured and responds to `SELECT 1`.
- `503` when D1 is not configured or the database check fails.

## Not yet implemented

- Login/session authentication
- Authorization and resource ownership checks
- License activation/revocation business logic
- Discord authentication
- Dashboard API
- Production database IDs and bindings
- Production data

Those remain separate tasks so the Phase 4 data foundation can be tested before business logic is introduced.
