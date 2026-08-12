# Phase 6 — Private Access

## Scope

Phase 6 establishes the server-side boundary for the future private dashboard. It does **not** build the dashboard UI; UI work belongs to Phase 11.

## Rules implemented

- No public registration endpoint exists.
- `/dashboard` and every nested `/dashboard/*` path require a valid D1-backed session cookie.
- `/api/v1/dashboard` and nested API dashboard paths use the same server-side access check.
- Missing, revoked, or expired sessions return HTTP `401` with the user-facing message:
  `You can't access this link`
- An authenticated account whose status is not `ACTIVE` returns HTTP `403` with:
  `Access Denied`
- Active authenticated accounts receive a minimal authorization response containing only the user id and username needed by the future UI boundary.
- Invite data, secrets, password hashes and unrelated internal data are not returned by the dashboard boundary.
- Role-specific permissions are deliberately deferred to Phase 10. In Phase 6, account status is the access gate and all active authenticated roles are allowed through the private boundary.

## Endpoints

### Private browser boundary

`GET /dashboard`

`GET /dashboard/<path>`

### Private API boundary

`GET /api/v1/dashboard`

`GET /api/v1/dashboard/<path>`

The API boundary exists so the future Phase 11 dashboard can consume server-authorized data without trusting client-side role or permission state.

## Expected responses

Unauthenticated:

```json
{
  "error": "UNAUTHENTICATED",
  "message": "You can't access this link",
  "request_id": "..."
}
```

HTTP: `401`

Authenticated but not permitted by account status:

```json
{
  "error": "ACCESS_DENIED",
  "message": "Access Denied",
  "request_id": "..."
}
```

HTTP: `403`

Authorized:

```json
{
  "private": true,
  "status": "authorized",
  "user": {
    "id": "...",
    "username": "..."
  },
  "request_id": "..."
}
```

HTTP: `200`

## Security notes

The boundary uses the existing `__Host-frezen_session` HttpOnly/Secure/SameSite cookie and validates the session server-side against D1. The browser cannot promote itself to an authorized user by changing a role field in frontend state.

No public registration route is added in this phase. Unknown registration URLs remain `404` rather than revealing an internal registration workflow.

## Testing

Run from `worker/`:

```bash
npm test
```

Phase 6 coverage includes:

- unauthenticated dashboard → `401`
- suspended authenticated account → `403`
- active authenticated account → `200`
- nested dashboard path protection
- API dashboard protection
- absence of public registration
- no invite/secret data in the private-boundary response

## Explicit non-goals

Phase 6 does not implement:

- Owner provisioning
- invite creation/use
- role/permission middleware
- dashboard UI
- 2FA/Passkeys
- product/license management UI

Those remain later roadmap phases.
