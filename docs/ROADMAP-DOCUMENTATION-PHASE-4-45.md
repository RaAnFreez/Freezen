# FREZEN CONTROL SYSTEM V3 — Phase 4–45 Documentation

> This document is a **planning and implementation specification**, not a claim that these phases are already implemented. Existing repository code must be audited against each phase before implementation.

## Rules for all remaining phases

1. Work strictly in numerical order.
2. Inspect current `main` before implementation.
3. Preserve working features and migrations.
4. Server-side authentication and authorization are authoritative.
5. Never trust client-supplied role, permission, license status or HWID decisions.
6. Never commit `.env`, tokens, passwords, API keys or private secrets.
7. Never execute uploaded Lua.
8. Never fake SafeLinkU verification or invent undocumented endpoints.
9. Every phase requires tests and verification.
10. A green GitHub Check does not automatically mean the phase is production-complete.
11. After implementation, create a focused PR; after merge, stop until explicitly instructed.

---

## Phase 4 — Database

### Objective
Complete the D1 data model and migration strategy.

### Required entities
`users`, `sessions`, `invites`, `licenses`, `products`, `scripts`, `script_versions`, `devices`, `discord_accounts`, `claims`, `audit_logs`, `security_events`, `api_keys`, `notifications`, `settings`.

### Requirements
- Primary keys and appropriate foreign keys.
- Unique constraints for identity/key fields.
- Indexes for lookup-heavy fields.
- Created/updated timestamps.
- Explicit status fields.
- Forward migrations that can be applied safely.
- No secrets in migration files.

### Verification
- Local D1 migration.
- Staging migration.
- Production migration plan.
- Read/write smoke test.
- Migration history verification.

---

## Phase 5 — Authentication

### Objective
Provide secure owner/team authentication and sessions.

### Requirements
- Login/logout.
- Password hashing using a modern password KDF.
- Session creation, expiry and revocation.
- Session rotation where required.
- Secure, HttpOnly, SameSite cookies.
- Secure cookie in HTTPS production.
- Login rate limiting.
- No plaintext passwords.
- Expired/revoked session → login.

### Verification
Valid login, invalid login, logout, expired session, revoked session and re-login.

> Existing authentication work must be audited rather than duplicated.

---

## Phase 6 — Private Access

### Objective
Make all administrative surfaces private.

### Requirements
- No public registration.
- Unauthenticated `/dashboard` and protected APIs → `401`.
- Authenticated user without permission → `403`.
- Frontend route hiding is not sufficient.
- Do not expose database details, owner identity, invites or secrets.

### Verification
Direct URL access, direct API calls, missing cookie, invalid session and insufficient role.

---

## Phase 7 — Owner

### Objective
Create the initial Owner authority model.

### Requirements
- Owner created during controlled initial setup.
- Full server-side privileges.
- Owner bypasses invite requirement only during controlled initial setup.
- Architecture ready for 2FA/Passkey.
- Owner identity is not exposed through public endpoints.

### Verification
Owner access to every protected area and denial of Owner-only actions to non-owner roles.

---

## Phase 8 — Invite System

### Objective
Enable invite-only team onboarding.

### Data
`id`, `code_hash`, `role`, `created_by`, `created_at`, `expires_at`, `max_uses`, `used_count`, `status`.

### Status
`ACTIVE`, `EXPIRED`, `REVOKED`, `DISABLED`, `USED`.

### Requirements
- Cryptographically secure random invite generation.
- Store a hash rather than the reusable code where appropriate.
- Expiration and max-use enforcement server-side.
- Revoke/disable controls.

### Verification
Valid, expired, revoked, max uses and duplicate use.

---

## Phase 9 — Team Login / Re-login

### Objective
Existing team users can log in repeatedly without a new invite.

### Requirements
- Invite only during initial onboarding.
- Normal `/login` for existing accounts.
- Valid session opening `/login` → dashboard.
- Invalid/expired session → normal login.

### Verification
Logout → login, valid session redirect and expired-session flow.

---

## Phase 10 — Role System

### Roles
- `OWNER`
- `ADMIN`
- `SUPPORT`

### Permission model
OWNER: full access.

ADMIN: licenses, keys, products, scripts, users, HWID and analytics.

SUPPORT: users, licenses and HWID.

### Requirements
Permissions are checked on the server for every sensitive operation. Frontend role values are display-only.

### Verification
Attempt every protected action using each role and direct API calls.

---

## Phase 11 — Dashboard UI

### Objective
Create the private Frezen Control System dashboard.

### UI
Dark theme, responsive, mobile-first, desktop optimized.

### Navigation
Overview, Licenses, Keys, Products, Scripts, Users, HWID, SafeLinkU, Discord, Analytics, Audit Logs, Invites, Security, Settings.

### Components
Sidebar/drawer, header, cards, tables, modals, toast, search, filters, pagination, loading, empty and error states.

### Verification
Android and desktop navigation, protected routes, responsive layout and accessibility basics.

---

## Phase 12 — Dashboard Overview

### Metrics
Total licenses, active, expired, revoked, users, script requests, SafeLinkU claims and HWID resets.

### Analytics
24H, 7D, 30D, 90D.

### Requirements
All metrics must come from authorized server-side data. No client-side fabricated counters.

---

## Phase 13 — Products

### Product fields
`id`, `name`, `description`, `version`, `status`, `created_at`, `updated_at`.

### Actions
Create, edit, disable and delete where safe.

### Verification
CRUD authorization, validation, uniqueness expectations and UI behavior.

---

## Phase 14 — License System

### Format
`FREZEN-XXXX-XXXX-XXXX`.

### Core fields
`id`, `key_hash`, `product_id`, `user_id`, `status`, `created_at`, `expires_at`, `max_devices`, `current_hwid`, `discord_user_id`, `last_seen`, `redeem_count`, `reset_count`.

### Status
`UNUSED`, `ACTIVE`, `EXPIRED`, `REVOKED`, `BANNED`.

### Actions
Generate, bulk generate, view, redeem, revoke, extend and reset HWID according to role.

### Security
Do not store or expose reusable secrets unnecessarily. License validation is server-side.

> Existing license lifecycle work must be audited against this specification before adding duplicate logic.

---

## Phase 15 — License UI

### Pages
`/licenses` and `/licenses/:id`.

### Table
License, product, status, user, HWID, created, expires and authorized actions.

### Filters
All, active, unused, expired, revoked and banned.

### Requirements
Search, pagination, safe action confirmation and role-based visibility.

---

## Phase 16 — HWID

### Objective
Bind valid licenses to authorized devices.

### Requirements
- First-device binding.
- Device limit.
- HWID validation.
- Reset cooldown.
- Block/unblock.
- Server-side comparison.

### Flow
`VALID LICENSE → FIRST DEVICE → BIND → NEXT REQUEST → COMPARE → ALLOW/DENY`.

### Verification
Bind, match, mismatch, reset and cooldown.

---

## Phase 17 — Lua Script Manager

### Objective
Manage Lua script files without executing them.

### Features
Upload Lua, upload new version, active version, release notes, metadata, disable and delete.

### Requirements
- File picker works on Windows and Android.
- Validate file type/size/content policy.
- Store script as data/object reference.
- Never execute uploaded Lua on Worker/server.

---

## Phase 18 — Script Versioning

### Data
`version`, `script_id`, `file_reference`, `release_notes`, `status`, `created_at`.

### Status
`ACTIVE`, `ARCHIVED`, `DISABLED`.

### Requirement
At most one active version per script/product according to the selected data model.

### Verification
Create version, switch active version, archive and disable.

---

## Phase 19 — Script ↔ License Authorization

### Authorization chain
Authentication → account status → license → license status → expiration → product → permission → HWID/device → delivery authorization.

### Deny
Expired, revoked, banned, invalid license, wrong product, wrong user/Discord identity or HWID mismatch.

### Requirement
Every decision is based on server-side state.

---

## Phase 20 — Secure Delivery

### Objective
Prevent permanent public access to protected scripts.

### Flow
Request → authentication → license validation → product validation → HWID validation → short-lived authorization → delivery.

### Requirements
Use short-lived authorization/signed delivery where appropriate. Do not expose permanent public script URLs.

### Verification
Valid request, expired license, revoked license, wrong HWID and unauthorized direct URL.

---

## Phase 21 — SafeLinkU

### Objective
Official SafeLinkU integration only.

### Requirements
- API key server-side only.
- Official documentation is the source of endpoint truth.
- No invented endpoints.
- No fake checkpoints or fake verification.
- Dashboard connection status and request result visibility.

### Dashboard
Connection Status, API Status, Last Request, Successful Claims, Failed Claims and Test Connection.

### Verification
Only after official API documentation and credentials are available through secret management.

---

## Phase 22 — Get Key

### Objective
Public key acquisition flow.

### Flow
Product selection → official SafeLinkU flow → Frezen API → authorized license generation → display/copy key.

### Requirements
- Public surface only exposes intended public functionality.
- No admin APIs.
- No fake verification.
- License generation is server-authorized.

---

## Phase 23 — Claim Protection

### Requirements
- Rate limiting.
- Cooldown.
- Duplicate claim protection.
- Claim history.
- Abuse detection/controls.

### Verification
Repeated claim, burst requests, duplicate identity and legitimate retry.

---

## Phase 24 — Discord Bot

### Objective
Build the Discord control interface using `discord.js`.

### Architecture
Discord Bot → Frezen API → D1.

No separate license database in the bot.

### Panel
`/panel` with Redeem Key, Get Script, Reset HWID and Get Stats.

---

## Phase 25 — Discord Redeem

### Flow
Modal → License Key → Frezen API → validate → link Discord ID → activate.

### Requirements
Use ephemeral/private responses where supported. Server validates ownership and status.

---

## Phase 26 — Discord Get Script

### Validation
Discord identity, license, product, status, expiration, HWID and permission.

### Delivery
Use the same secure delivery authorization as other clients. Discord is not an authorization bypass.

---

## Phase 27 — Discord HWID

### Validation
Discord ownership, license, status, cooldown and permission.

### Requirement
Reset must be performed by Frezen API, not locally in the bot.

---

## Phase 28 — Discord Stats

### Data
License, product, status, expiration, HWID, first activation, last seen and reset count.

### Privacy
Only return data the authenticated Discord user is authorized to view.

---

## Phase 29 — Analytics

### Metrics
License creation/redemption, script requests, SafeLinkU claims, HWID resets and failed requests.

### Time ranges
24H, 7D, 30D, 90D.

### Requirement
Analytics queries must be authorized and efficient for D1.

---

## Phase 30 — Audit Logs

### Events
`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, invite events, `ACCESS_DENIED`, license events, HWID events, script events, SafeLinkU, Discord linking, rate limits, settings changes and `EMERGENCY_LOCKDOWN`.

### Record
Timestamp, user, action, resource, status and request ID.

### Requirement
Audit events are generated server-side and protected from ordinary user modification.

> Existing license audit history must be expanded only after comparing it to this centralized event model.

---

## Phase 31 — Security Center

### Dashboard
Authentication, Cloudflare, WAF, rate limiting, session security and 2FA.

### Status
`Protected`, `Warning`, `Critical`.

### Requirement
Status must reflect real checks/configuration, not static decorative values.

---

## Phase 32 — API Management

### API key fields
`name`, `hash`, `scope`, `created_at`, `expires_at`, `last_used`, `status`.

### Scopes
`license:read`, `license:write`, `license:redeem`, `script:read`, `script:write`, `hwid:reset`, `stats:read`.

### Actions
Create, rotate, revoke and expire.

### Requirement
Never expose stored API key secrets after creation unless explicitly designed as one-time reveal.

---

## Phase 33 — API Security

### Requirements
- Authentication.
- Authorization.
- Role checks.
- Permission checks.
- Resource ownership.
- Input validation.
- Rate limiting.
- CSP.
- HSTS.
- X-Content-Type-Options.
- Referrer-Policy.
- Permissions-Policy.
- Restricted CORS.
- CSRF protection when required by the chosen authentication architecture.

### Verification
Direct API calls, manipulated roles, invalid payloads, missing auth and cross-origin requests.

---

## Phase 34 — Cloudflare Security

### Components
DNS, HTTPS, Workers, D1, WAF and rate limiting.

### Optional admin layer
Cloudflare Access may protect admin surfaces as an additional layer, but application authentication remains authoritative.

### Verification
TLS, WAF/rate-limit configuration and protected admin access.

---

## Phase 35 — Emergency Lockdown

### Owner-only
Activation requires explicit confirmation by typing `LOCKDOWN`.

### During lockdown
- Script delivery OFF.
- Get Key OFF.
- License redeem OFF.
- Team dashboard locked.
- Discord maintenance mode.
- Owner remains accessible.

### Requirement
State is server-side and audited.

---

## Phase 36 — Maintenance Mode

### Public
`Frezen is temporarily unavailable.`

### Owner
Owner retains access.

### Requirement
Maintenance state is server-side and must not be bypassable by frontend manipulation.

---

## Phase 37 — Notifications

### Events
License expiring, license expired, HWID reset, failed login, security alert, SafeLinkU failure and Discord failure.

### UI
`/notifications` plus notification bell.

### Requirement
Notification access is authenticated and scoped to the user/role.

---

## Phase 38 — Backup / Recovery

### Strategy
Database backup, retention, export, restore, recovery and secret rotation.

### Requirements
- Backups are not public.
- Restore procedure documented.
- Recovery access controlled.
- Secrets are rotated separately from database backups.

### Verification
At least one controlled recovery exercise before production-ready declaration where the platform supports it.

---

## Phase 39 — Testing

### Test groups
AUTH, PRIVATE, INVITE, LICENSE, HWID, SCRIPT, SAFELINKU, DISCORD, SECURITY and UI.

### Required cases
Valid and invalid flows, expiration, revocation, wrong HWID, permission denial, rate limits, CORS, CSRF where applicable, headers, secret exposure and mobile/desktop behavior.

### Requirement
Tests must be repeatable and tied to the current implementation.

---

## Phase 40 — Security Audit

### Must not exist
- Secrets in Git.
- API keys in frontend.
- Plaintext passwords.
- Public admin registration.
- Unprotected dashboard APIs.
- Client-controlled role.
- Client-controlled license status.
- Client-controlled HWID validation.
- Permanent public protected-script URL.
- Unrestricted sensitive APIs.
- Unrestricted sensitive CORS.

### Attack-style verification
Frontend manipulation, direct API calls, invalid/expired sessions, expired/revoked/wrong licenses, wrong HWID, wrong Discord user and wrong role must be denied.

---

## Phase 41 — Android Testing

### Tools
Termux + Acode.

### Test
Clone, install, run, build, Git, deployment, browser login/dashboard/invite/license/HWID/Lua upload/SafeLinkU/Discord/settings and Android file picker.

### Constraint
Termux TLS/certificate issues must be fixed at the environment/repository level; never disable TLS verification as a shortcut.

---

## Phase 42 — Windows Testing

### Tools
VS Code, PowerShell, Git, Node, npm and Wrangler.

### Browsers
Chrome, Edge and Firefox.

### Test
Dashboard, upload, licenses, HWID, Discord and SafeLinkU integration.

---

## Phase 43 — Production Preparation

### Requirements
- Production D1.
- Production Worker.
- Production secrets.
- Production domain.
- HTTPS.
- Cloudflare security.
- WAF.
- Rate limits.
- Backup.
- Monitoring.
- Private GitHub repository.

### Verification
No `.env` or secrets in Git; build and test succeed.

---

## Phase 44 — Deployment

### Order
1. Database/migrations.
2. Worker/API.
3. Dashboard.
4. Get Key.
5. Discord Bot.
6. Domain/DNS.

### Smoke tests
Login, invite, license, HWID, script authorization/delivery, SafeLinkU, Get Key, Discord and audit logs.

### Requirement
Production deployment must use production bindings/secrets and must not mix staging data.

---

## Phase 45 — Final Verification

### Production-ready checklist

- [ ] Private Access
- [ ] Owner Login
- [ ] Team Invite
- [ ] Re-login
- [ ] Session Security
- [ ] Role System
- [ ] Dashboard
- [ ] Product System
- [ ] License System
- [ ] HWID
- [ ] Lua Upload
- [ ] Script Versioning
- [ ] Script Authorization
- [ ] Secure Delivery
- [ ] SafeLinkU
- [ ] Get Key
- [ ] Claim Protection
- [ ] Discord Bot
- [ ] Redeem Key
- [ ] Get Script
- [ ] HWID Reset
- [ ] Stats
- [ ] Analytics
- [ ] Audit Logs
- [ ] Security Center
- [ ] API Management
- [ ] Cloudflare
- [ ] WAF
- [ ] Rate Limit
- [ ] Backup
- [ ] Emergency Lockdown
- [ ] Maintenance Mode
- [ ] Android Support
- [ ] Windows Support
- [ ] Security Audit
- [ ] Production Deployment

Only when all applicable requirements are implemented, tested, deployed and verified may the project be declared **100% production-ready**.

---

## Documentation-first workflow

This document is intentionally created before implementing Phases 4–45. It does **not** mark any phase complete.

For each phase after documentation is established:

`Audit current code → implement only that phase → test → PR → Checks → merge → verify → stop.`

The next implementation target after Phase 3 is **Phase 4 — Database**.
