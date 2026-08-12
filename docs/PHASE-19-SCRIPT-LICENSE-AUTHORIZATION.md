# Phase 19 — Script ↔ License Authorization

## Purpose

Phase 19 adds the server-side authorization gate that must succeed before Frezen can permit a script request. It is deliberately separate from script delivery: this phase decides **whether access is allowed**, while Phase 20 will handle short-lived authorization and secure delivery.

## Authorization order

A request to `POST /api/v1/scripts/:scriptId/authorize` requires an authenticated session and then checks, on the Worker/D1 side:

1. Account exists and is `ACTIVE`.
2. Script exists and is `ACTIVE`.
3. Script's product exists and is `ACTIVE`.
4. License exists.
5. License belongs to the authenticated user.
6. License status is `ACTIVE`.
7. License expiration timestamp has not passed.
8. License product matches the script product.
9. A device for the license/user exists for the submitted HWID hash.
10. The matching device is `ACTIVE`.
11. The requested script version is `ACTIVE`, or the script's current active version is selected when no version ID is supplied.

Any failed check returns `authorized: false` and fails closed.

## Client-controlled values

The client may submit `license_id`, `hwid`, and optionally `version_id`, but none of these values are trusted. The Worker resolves account, license, product, script, version and device state from D1 and compares the submitted values against those records.

The client cannot supply its own:

- license status
- expiration status
- product ownership
- script status
- version status
- HWID validity
- account status

## Endpoint

`POST /api/v1/scripts/:scriptId/authorize`

Request body:

```json
{
  "license_id": "license-id",
  "hwid": "client-device-identifier",
  "version_id": "optional-version-id"
}
```

Successful responses contain authorization metadata only. They do **not** return the Lua source. Script delivery remains Phase 20.

## Denial conditions

Examples include:

- `ACCOUNT_INACTIVE`
- `SCRIPT_DISABLED`
- `PRODUCT_DISABLED`
- `LICENSE_OWNERSHIP_REQUIRED`
- `LICENSE_EXPIRED`
- `LICENSE_REVOKED`
- `LICENSE_BANNED`
- `LICENSE_INACTIVE`
- `PRODUCT_LICENSE_MISMATCH`
- `HWID_MISMATCH`
- `HWID_BLOCKED`
- `SCRIPT_VERSION_NOT_ACTIVE`
- `ACTIVE_SCRIPT_VERSION_NOT_FOUND`

Authorization failures are written to the existing `audit_logs` table without recording the raw HWID.

## Security boundary

The existing authentication middleware remains responsible for session authentication. Phase 19 adds the business authorization boundary on top of it. No frontend role, license status or HWID result is accepted as an authority.

## Testing

`worker/tests/phase-19-script-license-authorization.test.js` covers:

- unauthenticated access
- inactive account
- disabled script/product
- expired/revoked/banned/inactive licenses
- expiration timestamps
- license ownership
- product mismatch
- HWID mismatch/block
- inactive version
- fully authorized request

No Lua code is executed by this feature.
