# Frezen Control System V3 — Phase 2

## Scope

Phase 2 establishes the production-oriented repository foundation. It does not create production credentials, deploy infrastructure, or implement authentication/database business logic.

## Repository applications

- `worker/` — Cloudflare Worker backend and API boundary
- `dashboard/` — private admin dashboard frontend
- `get-key/` — public GET KEY frontend
- `discord-bot/` — Discord integration client
- `docs/` — project documentation
- `tests/` — cross-application test planning

## Environment policy

Development, staging, and production must use separate Cloudflare resources and secrets. Never commit `.env`, `.dev.vars`, API keys, bot tokens, passwords, or master secrets.

## Deployment policy

GitHub is the source repository. Cloudflare Workers is the production runtime. A later phase will add GitHub Actions deployment after Cloudflare credentials are configured as GitHub Actions secrets.

## Security baseline

The Worker provides request IDs, no-store API responses, baseline security headers, and explicit 401/404 behavior. Authentication, authorization, CSRF, rate limiting, D1, and resource ownership checks are intentionally deferred to later phases.

## Branch policy

Phase work is developed away from `main`. Phase 2 uses `phase-2-initialization`. Do not merge until the phase has been reviewed and its tests have been run in a real development environment.

## Phase 2 acceptance checklist

- [x] Monorepo package root
- [x] Worker package
- [x] Dashboard package placeholder
- [x] GET KEY package placeholder
- [x] Discord bot package placeholder
- [x] Environment template
- [x] Git ignore rules
- [x] Worker status route
- [x] Security header baseline
- [x] Basic Worker smoke-test file
- [ ] Install dependencies locally
- [ ] Run automated tests
- [ ] Configure Cloudflare account
- [ ] Create D1 environments
- [ ] Deploy staging

The unchecked items require credentials or an actual runtime and belong to the next operational phase.