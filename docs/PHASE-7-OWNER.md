# Phase 7 — Owner System

## Scope

Phase 7 adds the initial Owner account setup required by the Frezen Control System V3 roadmap.

## Security model

- No public registration is introduced.
- The initial Owner is created only once.
- `OWNER_EMAIL` is the server-side canonical Owner email.
- `FREZEN_MASTER_SECRET` authorizes the one-time setup endpoint and must be configured as a Worker secret.
- The setup secret is never returned to the client and is never stored in D1.
- The Owner password is supplied only during setup and is stored as a PBKDF2-SHA-256 password hash.
- The API response never contains the password or password hash.
- A second Owner cannot be created through the endpoint.
- Owner role and status are written server-side as `OWNER` and `ACTIVE`.

## Endpoint

`POST /api/v1/setup/owner`

Required server configuration:

```text
OWNER_EMAIL=<owner email>
FREZEN_MASTER_SECRET=<random secret, at least 32 characters>
```

Required request header:

```text
x-frezen-setup-secret: <same value as FREZEN_MASTER_SECRET>
```

Example body:

```json
{
  "email": "owner@example.com",
  "username": "owner",
  "password": "a password with at least 12 characters"
}
```

The example is documentation only. Never commit real secrets or passwords.

## Expected responses

- `201` — Owner created.
- `400` — invalid input or email does not match `OWNER_EMAIL`.
- `401` — invalid setup secret.
- `409` — Owner already exists or email already exists.
- `503` — D1/configuration error.

## Operational requirement

Run the setup endpoint only over HTTPS and only during initial provisioning. After the Owner exists, the endpoint refuses further Owner creation. The `FREZEN_MASTER_SECRET` remains a server-side secret and should be rotated according to the deployment's secret-management policy.

## Phase boundary

This phase does not implement the full dashboard, role/permission middleware, 2FA/passkeys, invites, or other later roadmap phases.
