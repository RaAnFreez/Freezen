# Phase 3 — Cloudflare

## Purpose

Document the Cloudflare Worker, D1, Wrangler, and environment separation required by the Frezen Control System V3 roadmap.

## Environments

Frezen must keep these environments separate:

- development
- staging
- production

Each environment must use its own Worker/D1 data and environment-specific secrets/bindings. Never use production data for local tests.

## Wrangler workflow

```text
Local development
      |
      v
Wrangler local/dev
      |
      v
Staging Worker + Staging D1
      |
      v
Checks / smoke tests
      |
      v
Production Worker + Production D1
```

The exact deploy commands must follow the repository's current Wrangler configuration and Cloudflare account state. Do not invent a D1 database ID or domain.

## D1

D1 migrations are version-controlled. A migration must be applied to the intended environment only.

Before applying a migration:

1. Confirm the target database/environment.
2. Inspect the migration file.
3. Run the repository's documented migration command.
4. Verify schema/query behavior.
5. Never point development migration commands at production accidentally.

## HTTPS and domain

Cloudflare Workers provide HTTPS for workers.dev deployments. A custom production domain may be configured later after the real domain and DNS state are verified.

No domain is hardcoded here because deployment state must be verified rather than assumed.

## Secrets

Never commit Cloudflare credentials, API tokens, D1 credentials, Frezen master secrets, Discord bot tokens, or SafeLinkU API keys.

Use Cloudflare/Wrangler secret management for production values. `.env.example` remains documentation only.

## Verification checklist

- [x] Worker/Wrangler configuration exists in the repository baseline.
- [x] D1 migration infrastructure exists in the repository baseline.
- [x] Development/staging/production separation is explicitly documented.
- [x] HTTPS/workers.dev deployment model is documented.
- [x] Secret handling rules are documented.
- [x] Production domain is not invented or hardcoded.
- [ ] Current operator has verified Wrangler authentication locally.
- [ ] Staging Worker/D1 deployment has been verified against the real Cloudflare account.
- [ ] Production Worker/D1 deployment has been verified against the real Cloudflare account.

## Scope boundary

This phase does not claim that real Cloudflare resources are provisioned merely because configuration files exist. Real account/resource verification must be performed against the correct Cloudflare account/environment.

## Next phase

After Phase 3 checks and real deployment prerequisites are verified, the next roadmap phase is **Phase 4 — Database**. Do not start Phase 4 until explicitly instructed.
