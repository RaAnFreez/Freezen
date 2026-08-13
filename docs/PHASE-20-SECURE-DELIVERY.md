# Phase 20 — Secure Delivery

## Purpose

Phase 20 turns the Phase 19 authorization result into a controlled, short-lived script delivery flow.

## Flow

1. Client authenticates with the existing Frezen session.
2. Client calls `POST /api/v1/scripts/:scriptId/authorize` with the license ID and HWID.
3. Phase 19 performs server-side account, script, product, license, expiration, permission and HWID checks.
4. Frezen issues a signed bearer token containing only the authorization context required for delivery.
5. The token expires after **60 seconds**.
6. Client sends the token to `POST /api/v1/scripts/:scriptId/deliver` using the `Authorization: Bearer <token>` header.
7. The Worker verifies the HMAC signature and expiration.
8. The Worker re-queries D1 and re-validates the account, license, product, script, device and version state before returning source.
9. Source is returned only for an active authorized version.

## Security properties

- No permanent public script URL is created.
- The delivery token is not stored as a license credential in D1.
- The token is signed server-side with `FREZEN_MASTER_SECRET`.
- The secret must be at least 32 characters and must never be committed to Git.
- The token contains no Lua source.
- A revoked/expired license, blocked device, disabled script, disabled product or inactive version is denied even if a previously issued token has not expired yet.
- Delivery responses use `Cache-Control: no-store, no-cache, must-revalidate`.
- The Worker never executes, evaluates or imports uploaded Lua.
- The delivery endpoint uses a POST request and bearer header instead of putting the token in a URL.

## Environment

Set the production/staging secret through Cloudflare/Wrangler secret management:

`FREZEN_MASTER_SECRET=<random secret of at least 32 characters>`

Do not put the real value in `.env`, GitHub, README files, frontend JavaScript, or chat messages.

## Endpoints

### Authorize

`POST /api/v1/scripts/:scriptId/authorize`

Returns authorization metadata plus:

- `delivery.token`
- `delivery.expires_in`
- `delivery.endpoint`

### Deliver

`POST /api/v1/scripts/:scriptId/deliver`

Header:

`Authorization: Bearer <delivery.token>`

On success the response body is the Lua source and the response contains `Content-Disposition: attachment`.

## Testing

`worker/tests/phase-20-secure-delivery.test.js` covers:

- token signing
- missing token rejection
- successful authorized delivery
- denial after license revocation
- no-cache delivery behavior

Phase 20 does not implement public GET-Key delivery, SafeLinkU, Discord delivery, or permanent object-storage URLs. Those remain later phases and must use this authorization boundary.
