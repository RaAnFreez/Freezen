# Frezen Authentication Phase 4

## Scope

This phase adds a minimal authentication foundation for protected Worker API routes without introducing a new database table or changing the existing D1 schema.

## Credential

Protected API routes use a Worker secret named `FREZEN_API_TOKEN`.

Clients send:

`Authorization: Bearer <token>`

The token must be stored in Cloudflare Worker secret management and must never be committed to Git or placed in `wrangler.toml`.

## Protected routes

- `GET /api/v1/users/:external_id`
- `GET /api/v1/licenses/:license_id`

The health/status endpoints remain public so deployment monitoring can continue to work without credentials.

## Responses

- Missing/malformed Authorization header: `401 UNAUTHENTICATED`
- Incorrect token: `403 UNAUTHORIZED`
- Missing Worker secret configuration: `503 AUTH_NOT_CONFIGURED`

No credential value is returned in API responses or logs.

## Rollout safety

The authentication code must be tested before merging. The production Worker secret must be configured before deploying a version that enforces authentication on the protected routes.
