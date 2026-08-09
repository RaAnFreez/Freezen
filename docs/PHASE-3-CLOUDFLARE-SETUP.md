# Frezen Control System V3 — Phase 3

## Goal

Prepare the Worker for Cloudflare deployment with isolated development, staging, and production environments.

## Important

This repository does not contain Cloudflare API tokens, account secrets, Discord credentials, SafeLinkU credentials, passwords, or the Frezen master secret.

## Cloudflare resources

Create three separate D1 databases later:

- Frezen D1 Development
- Frezen D1 Staging
- Frezen D1 Production

Do not reuse a production database for development testing.

## Local verification

From `worker/`:

```bash
npm install
npx wrangler dev
```

The Worker should expose the status route locally:

`GET /api/v1/status`

Expected JSON contains:

- `name`: `Frezen Control System V3`
- `status`: `ok`
- `environment`: `development`
- `request_id`: a generated UUID

## Staging deployment

After a Cloudflare account is available and authenticated:

```bash
npx wrangler deploy --env staging
```

Verify the staging Worker before production deployment.

## Production deployment

Only after staging passes its tests:

```bash
npx wrangler deploy --env production
```

## GitHub Actions

A later hardening step can use GitHub Actions for automatic deployment. Cloudflare credentials must be stored as GitHub Actions secrets, never in source files.

## 24/7 behavior

A successfully deployed Cloudflare Worker runs on Cloudflare's infrastructure and does not require a Windows PC, Android phone, Termux session, or local terminal to remain running.

## Current Phase 3 boundary

Implemented:

- Worker environment definitions
- Development/staging/production Worker names
- Deployment command documentation
- Secret-handling policy

Not yet implemented:

- D1 databases
- D1 migrations
- production secrets
- custom domain
- GitHub Actions production deployment
- authentication
- license logic

Those are intentionally handled in later phases.
