# Phase 5 — Authentication

## Scope

This phase implements server-side authentication foundations without changing the Cloudflare Worker + D1 architecture.

Implemented:

- Email/password login.
- PBKDF2-SHA-256 password hashing with a per-password random salt.
- D1-backed sessions.
- Session expiration and revocation.
- Session rotation on successful login.
- `__Host-` secure HttpOnly SameSite cookie.
- Logout and session listing/revocation.
- Login rate limiting.
- Password-reset token storage and one-time consumption.
- Generic forgot-password response to reduce account enumeration.
- Development/test-only reset-token exposure for verification without pretending an email provider exists.
- Production reset responses never expose the reset token.

Cloudflare Workers provides Web Crypto APIs including PBKDF2 and cryptographically secure random values, so no Node-only crypto dependency is required. citeturn0search0turn0search8

## Endpoints

### `POST /api/v1/auth/login`

Body:

```json
{"email":"owner@example.com","password":"<password>"}
```

Successful login creates a new D1 session and returns a `Set-Cookie` header.

### `POST /api/v1/auth/logout`

Revokes the current session and clears the session cookie.

### `GET /api/v1/auth/verify`

Production authentication is session-based. Missing, expired, revoked, disabled or invalid sessions return `401`.

### `GET /api/v1/auth/sessions`

Returns only the authenticated user's session metadata. Session credentials are never returned.

### `DELETE /api/v1/auth/sessions/:id`

Revokes a session belonging to the authenticated user.

### `POST /api/v1/auth/forgot-password`

Returns the same public response whether or not the email exists. This prevents account enumeration.

A reset token is generated and stored hashed in D1. No email provider is invented. During development/test only, the token is returned so the complete reset flow can be verified without exposing it in production.

### `POST /api/v1/auth/reset-password`

Consumes an unexpired one-time reset token, replaces the password hash, marks the token used and revokes all existing sessions for that user.

## Password storage

Passwords are never stored plaintext. The stored representation is:

`pbkdf2$sha256$<iterations>$<salt>$<derived-key>`

The implementation uses 120,000 PBKDF2 iterations and a 16-byte random salt.

## Session security

Cookie:

- `__Host-frezen_session`
- `Secure`
- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- 7-day maximum age

The session token itself is never stored in D1. Only a SHA-256 hash is stored.

On successful login, existing active sessions for that user are revoked before a new session is created. Password reset also revokes all existing sessions.

## Rate limiting

Login attempts are tracked per normalized email identifier in D1.

- Window: 15 minutes
- Maximum failed attempts: 5
- A successful login clears the failure counter.

## D1 migration

Phase 5 adds:

- `password_reset_tokens`
- `auth_rate_limits`

D1 migration history remains managed by Wrangler. Cloudflare documents `d1_migrations` as the migration bookkeeping table and recommends applying versioned SQL through `wrangler d1 migrations apply`; application code should not manually create or manage that table. citeturn1search0turn1search1

For this repository, the migration file is:

`worker/migrations/0003_phase5_authentication.sql`

## Environment / secrets

Do not place passwords, reset tokens, session tokens or API credentials in Git.

Cloudflare Worker secrets are exposed to the Worker through encrypted bindings and should be configured through the platform's secret management. citeturn0search9

## Important boundary

Phase 5 does **not** implement Owner creation, invite registration, roles/permissions, dashboard UI or 2FA/Passkeys. Those belong to later roadmap phases.

The password-reset email delivery provider is intentionally not guessed. Production reset tokens are not returned by the API; a real delivery provider must be selected and integrated explicitly before a production password-reset email flow is declared complete.

## Verification

Automated tests cover:

- password hashing and verification
- secure cookie attributes
- missing D1 handling
- malformed login input
- production session requirement

After the PR passes, the D1 migration must be applied to the intended non-production environment first, then verified before production migration. Cloudflare supports remote development and D1 migrations through Wrangler and the dashboard. citeturn1search4turn1search5
