# Phase 4 Authentication

Frezen protects the user and license lookup APIs with a bearer token stored as a Cloudflare Worker secret.

## Protected endpoints

- `GET /api/v1/auth/verify`
- `GET /api/v1/users/:externalId`
- `GET /api/v1/licenses/:licenseId`

Send:

`Authorization: Bearer <AUTH_TOKEN>`

Requests without a valid token receive `401 UNAUTHENTICATED`.

## Production secret

Do **not** put the token in Git, `wrangler.toml`, source code, or chat.

Create `AUTH_TOKEN` as a Cloudflare Worker secret for the production environment using the Cloudflare dashboard's Worker Secrets interface (or Wrangler secret management). The secret must be configured before protected production endpoints are used.

If the secret is missing, the authentication endpoint intentionally returns `503 AUTH_CONFIGURATION_ERROR` rather than allowing unauthenticated access.

`/api/v1/status` and `/api/v1/health/db` remain available for health monitoring.
