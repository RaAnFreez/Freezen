# Phase 14 — License System

## Scope

Phase 14 implements the backend license lifecycle defined by the Master Build Roadmap. Phase 15 license-management UI is intentionally not included.

## Implemented

- Cryptographically random license generation.
- SHA-256 license-key hashing at rest.
- Plaintext license key returned only at creation time; never stored in D1.
- Product validation before license generation.
- `UNUSED` → `ACTIVE` redemption for an authenticated user.
- Duplicate/competing redemption protection.
- Automatic expiration detection during validation.
- Expiration status synchronization to `expired` when possible.
- Manual `active`, `revoked` and `banned` status management.
- License extension from the later of the current expiration or current time.
- Expired-license reactivation when extended.
- HWID reset by clearing the current license HWID and incrementing the reset counter.
- License lifecycle audit events for generation, redemption, status changes and expiration synchronization.
- Existing license validation remains server-authoritative.

## API

### `POST /api/v1/licenses`

Requires `licenses:write`.

Body:

```json
{
  "product_id": "product-id",
  "duration_days": 30,
  "max_devices": 1
}
```

The response contains the plaintext `license_key` exactly once. The value must not be logged, persisted in frontend state, or committed to source control.

### `POST /api/v1/licenses/redeem`

Requires an authenticated user session.

```json
{
  "license_key": "FREZEN-..."
}
```

A valid unused license becomes `active` and is assigned to the authenticated user.

### `POST /api/v1/licenses/:id/extend`

Requires `licenses:write`.

```json
{
  "duration_days": 30
}
```

### `PATCH /api/v1/licenses/:id/status`

Requires `licenses:write`.

Accepted states: `active`, `revoked`, `banned`.

### `POST /api/v1/licenses/:id/hwid/reset`

Requires `hwid:write`.

### `POST /api/v1/licenses/validate`

Existing validation endpoint. It remains server-side and rejects revoked, banned, expired and inactive licenses.

## Security boundaries

- Never return `license_key_hash` from an API response.
- Never accept a client-supplied license status as authoritative.
- Never treat a license as active without server-side validation.
- License generation is restricted by server-side permissions.
- Redemption is bound to the authenticated server-side user identity.
- Uploaded scripts are not executed by this phase.
- Phase 16 will expand HWID binding, device limits, cooldowns and block/unblock behavior.
- Phase 15 will add the dedicated license-management UI.

## Verification

Run the Worker test suite with:

```bash
npm test
```

Do not mark Phase 14 complete until GitHub Checks pass and the resulting pull request is reviewed and merged.
