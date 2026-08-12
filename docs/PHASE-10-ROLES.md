# Phase 10 — Role System

## Roles

- `OWNER` — full access.
- `ADMIN` — licenses, keys, products, scripts, users, HWID, and analytics according to the permission matrix.
- `SUPPORT` — users, license read access, and HWID read/reset access.

## Server-side authorization

Role authorization is derived from the authenticated session joined to the `users` table. Frontend/client values are never accepted as the source of truth.

The reusable middleware is in `worker/src/security/roles.js`.

Permission checks return:

- `401 UNAUTHENTICATED` when no authenticated account is present.
- `403 FORBIDDEN` when the account lacks the required permission.

## Current route enforcement

- License validation/read operations: `licenses:read`
- License status changes: `licenses:write`
- License audit: `licenses:read`
- User details and user license summaries: `users:read`
- Invite management remains Owner-only as established in Phase 8.
- Dashboard access remains authenticated/private and does not grant extra privileges.

## Verification

`worker/tests/phase-10-roles.test.js` verifies the role matrix, normalization, unknown-role denial, and 401/403 authorization behavior.

## Out of scope

Phase 11 dashboard UI and future feature-specific endpoints that are not yet implemented.
