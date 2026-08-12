# Phase 16 — HWID

Phase 16 implements server-authoritative device binding and HWID management.

## Data model

Migration: `worker/migrations/0005_phase16_hwid.sql`

The `devices` table stores:

- device ID
- license ID
- user ID
- SHA-256 HWID hash
- `active` / `blocked` status
- first/last seen timestamps
- block metadata

Raw HWID values are never persisted. `licenses.hwid_reset_at` and `licenses.hwid_reset_cooldown_until` record reset state.

## API

Authenticated management endpoints:

- `GET /api/v1/hwid?license_id=<id>` — list device metadata without HWID hashes.
- `POST /api/v1/hwid` — bind a device to an owned, usable license.
- `POST /api/v1/hwid/validate` — validate a device against the authenticated license owner.
- `POST /api/v1/hwid/licenses/:licenseId/reset` — reset active device bindings and start the reset cooldown.
- `PATCH /api/v1/hwid/devices/:deviceId/block` — block a device.
- `PATCH /api/v1/hwid/devices/:deviceId/unblock` — unblock a device.

The existing `POST /api/v1/licenses/:licenseId/hwid/reset` path delegates to the same Phase 16 reset implementation.

## Rules

1. The license must exist and be usable.
2. The authenticated user must own the license for bind/validate operations.
3. A license cannot exceed `max_devices` active devices.
4. A matching active device is accepted and its `last_seen` timestamp is updated.
5. A mismatch is denied with `HWID_MISMATCH`.
6. A blocked device is denied.
7. Reset blocks all currently active devices for the license and clears the license's current HWID marker.
8. Reset cooldown defaults to 24 hours and can be configured with `HWID_RESET_COOLDOWN_SECONDS` (0–2,592,000 seconds).
9. Server-side authentication and permissions remain authoritative.
10. Raw HWID values and HWID hashes are never returned by the dashboard/API.

## Dashboard

The **HWID** navigation item now contains a responsive Phase 16 surface for:

- license selection
- device binding
- validation
- reset
- device status listing
- block/unblock
- first/last seen metadata

The dashboard only renders device IDs and status metadata; it never receives a stored HWID hash.

## Verification

Automated coverage is in `worker/tests/phase-16-hwid.test.js` for binding, device limits, matching/mismatching validation, block/unblock and reset behavior.

Phase completion requires CI to pass, PR merge, deployment/migration success and manual production verification. Passing Checks alone does not declare Phase 16 complete.
