# Frezen staging D1 and Worker deployment

This workflow is deliberately separate from the production deployment workflow.

## What this staging baseline contains

The staging-only migration directory `worker/migrations-staging/` provides the minimum schema needed to exercise the Frezen client-license validation and HWID v2 code paths:

- `users`, `products`, and `licenses`
- `frezen_key_records` and `frezen_key_limits`, used by existing HWID v2 lookup queries
- `hwid_bindings_v2`

It does **not** import production data, replay the legacy `worker/migrations/` chain, or provision the full dashboard schema. Some legacy migrations share numeric prefixes and the earliest schema definitions differ. The staging binding selects `migrations-staging` specifically so the staging baseline does not alter or reorder the historical production migrations.

## Deploy staging

After this change is merged to `main`:

1. Open GitHub Actions for the Frezen repository.
2. Select **Deploy Frezen Staging Worker**.
3. Choose the `main` branch and run the workflow.
4. Confirm the run reports success. The workflow checks the staging and production database IDs, validates the staging SQL using SQLite, runs Worker tests, applies migrations to the named `frezen-staging` database with `--env staging`, verifies the required queries, and deploys with `wrangler deploy --env staging`.

The staging workflow is manual-only. It does not run on a push and contains no production deployment command. The existing production workflow remains separate.

The repository must have valid `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` Actions secrets with Worker deployment and D1 migration permissions. Do not paste either secret into GitHub files or chat.

## API activation gate

`FREZEN_CLIENT_LICENSE_API_ENABLED` remains `false` in staging and production. The public validation route should not be enabled until a staging-only test license/product has been provisioned and route-level rate limiting has been configured and tested.

The baseline is intentionally limited to the client-license/HWID integration. It is **not** a replacement for the full application schema and should not be treated as a complete staging copy of the Frezen dashboard. Do not run the legacy migration chain against a fresh staging database without a separate audit.
