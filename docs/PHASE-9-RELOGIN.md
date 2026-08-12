# Phase 9 — Team Login / Re-login

## Scope

Phase 9 implements the Master Build Prompt re-login behavior without introducing Phase 10 role-management features or Phase 11 dashboard UI.

## Flow

```text
Existing account
    |
    +-- Logout --> session revoked + cookie cleared --> /login
    |
    +-- /login with valid session --> /dashboard
    |
    +-- /login without valid session --> credentials --> new session --> /dashboard
```

## Rules

- Existing accounts do not require an invite to log in again.
- A valid `__Host-frezen_session` session is the server-side source of authentication state.
- A login request with an already valid session does not create another active session.
- An already authenticated login response includes `redirect_to: /dashboard`.
- A successful credential login creates a fresh session and includes `redirect_to: /dashboard`.
- Logout revokes the current session and clears the session cookie.
- Logout includes `redirect_to: /login`.
- Password reset revokes active sessions so the user must authenticate again.
- Session tokens and password hashes are never returned in the response.
- Authentication remains server-side; frontend-provided role/status values are not trusted.

## Verification

The Phase 9 test contract verifies:

1. An authenticated user re-entering `/login` is sent to `/dashboard`.
2. Logout clears the session cookie and returns the client to `/login`.
3. Re-login responses do not expose password hashes or session tokens.

## Out of scope

- Phase 10 role/permission expansion.
- Phase 11 dashboard UI.
- Public registration.
