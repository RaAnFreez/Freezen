# Phase 15 — License UI

Phase 15 implements the roadmap requirement for license listing/detail pages, filters, search, pagination and safe actions.

## Backend

`GET /api/v1/licenses` is authenticated with the existing `licenses:read` permission and supports:

- `page` — 1-based page number.
- `page_size` — 1–50 records per page.
- `status` — `unused`, `active`, `expired`, `revoked`, or `banned`.
- `product_id` — exact product filter.
- `q` — searches license ID, user ID, username, email, product ID and product name.

The response contains pagination metadata and safe license fields only. `license_key_hash` and plaintext license keys are never returned by the listing endpoint.

The existing detail endpoint remains `GET /api/v1/licenses/:id` and is also protected by `licenses:read`.

## Dashboard

The existing **Licenses** navigation item now opens the Phase 15 management surface with:

- Search.
- Status filter.
- Paginated table.
- License detail view.
- Product/user/status/expiration/device/redeem/HWID-reset metadata.
- Audit history preview.
- Activate, revoke and ban actions.
- Expiration extension.
- HWID reset.

All mutations continue through server-authorized endpoints. The UI never decides whether a user may perform an action.

## Security constraints

- No plaintext license key is stored or returned by list/detail endpoints.
- The license hash is never rendered in the dashboard.
- Search does not attempt to search plaintext keys because Frezen stores only their hashes.
- Existing server-side role and permission middleware remains authoritative.
- Mutating actions require confirmation in the UI and are still re-authorized by the Worker.

## Verification

Automated coverage is in `worker/tests/phase-15-license-ui.test.js` for authentication, pagination, status filtering, metadata search, safe response fields and invalid query validation.

Phase completion still requires GitHub Checks to pass, merge, deployment and production/manual dashboard verification. A passing CI check alone does not declare the phase complete.
