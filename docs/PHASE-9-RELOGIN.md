# Phase 9 — Team Login / Re-login

Phase 9 covers re-login for existing team accounts. Existing accounts authenticate through the Phase 5 session system and do not need another invite.

## Required behavior

- Valid session + `/login` returns `redirect_to: /dashboard` without creating a second active session.
- Valid credentials without a session create a fresh session and return `redirect_to: /dashboard`.
- Logout revokes the current session, clears `__Host-frezen_session`, and returns `redirect_to: /login`.
- Password reset revokes active sessions and requires a fresh login.
- Password hashes and session tokens are never returned by the API.
- Server-side session state is authoritative.

## Verification

The Phase 9 test contract covers authenticated re-login, logout-to-login routing, and response secret exposure.

## Out of scope

Phase 10 role/permission expansion, Phase 11 dashboard UI, and public registration.
