# Phase 21 — SafeLinkU Integration

## Scope

Phase 21 adds a server-side SafeLinkU integration boundary without inventing provider endpoints or faking checkpoint verification.

## Configuration

The Worker expects:

- `SAFELINKU_API_KEY` — secret, server-side only.
- `SAFELINKU_API_BASE_URL` — exact HTTPS API base URL supplied by the official SafeLinkU API contract.

The base URL is intentionally not hardcoded because the publicly accessible SafeLinkU site does not provide a machine-readable API specification for the claim/checkpoint operation used by Frezen. The integration therefore fails closed until the exact official endpoint and payload contract is known.

Do not put `SAFELINKU_API_KEY` in frontend code, HTML, client JavaScript, Git, or API responses.

## Protected endpoints

- `GET /api/v1/safelinku/status` — `safelinku:read`
- `POST /api/v1/safelinku/test-connection` — `safelinku:write`
- `GET /api/v1/safelinku/stats` — `safelinku:read`

Only `OWNER` and `ADMIN` have the SafeLinkU permissions in the current role matrix. `SUPPORT` does not receive them.

The status endpoint reports only whether the configuration is present and the provider origin. It never returns the API secret.

## Connection test

The connection adapter:

1. Requires an HTTPS base URL.
2. Requires the server-side API secret.
3. Uses a bounded 8-second timeout.
4. Sends the secret only in the Worker-side `Authorization` header.
5. Returns a small status object rather than provider response bodies.
6. Fails closed when configuration is incomplete.

## Claim/checkpoint behavior

A fake claim success is deliberately impossible in this phase. The claim function returns `501 SAFELINKU_CLAIM_ENDPOINT_NOT_CONFIGURED` until the exact official SafeLinkU claim/checkpoint API contract is supplied.

This is required by the Master Build Prompt: do not invent endpoints and do not create fake checkpoints.

The public SafeLinkU website is available at `https://safelinku.com/`; its public pages describe the URL-shortening service, but they do not provide the machine-readable claim API contract required to safely implement the Frezen claim flow.

## Telemetry

Migration `0007_phase21_safelinku.sql` creates `safelinku_events`. It stores only:

- event ID
- success/failure outcome
- Frezen request ID
- timestamp

No provider secret is stored in D1.

## Verification

`worker/tests/phase-21-safelinku.test.js` verifies configuration validation, HTTPS enforcement, secret non-disclosure, connection behavior, server-side authorization header usage, fail-closed claim behavior, and provider telemetry.

Before production claim integration, obtain the exact official SafeLinkU API documentation and add only the documented endpoint, request schema, response schema and verification semantics. Do not infer these from frontend behavior.
