# Phase 8 — Invite System

## Scope

Phase 8 implements invite-only team account creation. Existing authenticated team members re-login through Phase 5 and do not need a new invite for every login.

## Owner controls

`POST /api/v1/invites`

Creates an invite. Only an authenticated `OWNER` may call this endpoint.

Supported roles:

- `ADMIN`
- `SUPPORT`

Optional request fields:

- `role`
- `max_uses` (1–1000)
- `expires_in_hours`

The invite code is generated with Web Crypto random bytes. Only the code is returned once to the Owner; the database stores `code_hash`.

`GET /api/v1/invites`

Lists invite metadata for the Owner. Secret invite codes and hashes are never returned.

`PATCH /api/v1/invites/:id`

Owner-only status control. Active invites may be revoked or disabled.

## Public redemption

`POST /api/v1/invites/redeem`

Creates the initial team account using a valid invite code, email, password and optional username.

Validation includes:

- invite exists
- invite is active
- invite is not expired
- invite has remaining uses
- email is not already registered
- password length is 12–256 characters
- optional username length is 3–64 characters

The created user receives only the invite's `ADMIN` or `SUPPORT` role and starts as `ACTIVE`.

## Security rules

- Invite codes are hashed before persistence.
- `Math.random()` is not used for invite generation.
- OWNER creation remains separate from invite redemption.
- A client cannot request the `OWNER` role through the invite endpoint.
- Invite status and use limits are enforced server-side.
- Invite hashes are never included in API responses.
- Passwords are passed to the existing Phase 5 password hashing primitive and are never stored plaintext.
- No Phase 9 re-login functionality is introduced here.

## Verification

Run the existing worker test suite through the repository CI. Phase 8 is complete only when all checks pass.
