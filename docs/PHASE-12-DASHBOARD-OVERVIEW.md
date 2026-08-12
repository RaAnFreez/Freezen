# Phase 12 — Dashboard Overview

## Scope

Phase 12 connects the Phase 11 dashboard shell to server-side overview metrics.

## Metrics

- Total Licenses
- Active Licenses
- Expired Licenses
- Revoked Licenses
- Users
- Script Requests
- SafeLinkU Claims
- HWID Resets

The dashboard never fabricates values. If the database has no activity, the UI shows an empty state.

## Ranges

The overview API supports:

- `24h`
- `7d`
- `30d`
- `90d`

The selected range controls activity metrics and trend charts.

## API

`GET /api/v1/dashboard/overview?range=7d`

Authentication and authorization are server-side. The endpoint requires the existing `users:read` permission and uses the authenticated session as the source of identity.

The response includes metrics, license activity, script-request activity, recent audit activity, viewer role, and a request ID. Password hashes, session token hashes, API secrets, and license key plaintext are not returned.

## Data sources

- `licenses` for license totals and license activity.
- `users` for active user count.
- `audit_logs` for script requests, HWID resets, and recent activity.
- `claims` for successful SafeLinkU claims.

## Verification

From the dashboard directory:

```bash
npm install
npm test
npm run build
```

From the worker directory, run the existing worker test suite.

## Out of scope

Phase 13 Product CRUD and later feature-specific dashboard pages remain unchanged.
