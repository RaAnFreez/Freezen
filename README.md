# FREZEN CONTROL SYSTEM V3

Private production platform for managing software/scripts owned by the project owner.

> **Roadmap source of truth:** this README contains the Master Build Roadmap. Future development must consult this file before starting a new phase. Do not invent or rename phases without updating this roadmap deliberately.

## Master Build Roadmap

### Phase 0 — Preparation
- Development preparation for Windows, Android/Termux/Acode, Cloudflare, GitHub, Discord and SafeLinkU.
- Never request real secrets in chat.

### Phase 1 — Architecture
- Cloudflare edge → public Get Key/private panel → Frezen API → D1.
- Discord Bot uses Frezen API as source of truth.
- License, Script and HWID systems are server-authoritative.

### Phase 2 — Project Initialization
- Project structure, package configuration, Git configuration, `.gitignore`, README and development scripts.
- Build/install verification.

### Phase 3 — Cloudflare
- Workers, D1, Wrangler and development/staging/production environments.
- HTTPS/domain/deployment documentation.

### Phase 4 — Database
- D1 schema and migrations for users, sessions, invites, licenses, products, scripts, script versions, devices, Discord accounts, claims, audit logs, security events, API keys, notifications and settings.

### Phase 5 — Authentication
- Login/logout, password hashing, sessions, expiration/rotation, secure cookies and rate limiting.
- Expired sessions return the user to login.

### Phase 6 — Private Access
- Dashboard is private.
- No public registration.
- Unauthenticated → 401.
- Authenticated without permission → 403.
- Do not expose internal data, secrets or invite information.

### Phase 7 — Owner
- Initial Owner account with full access.
- 2FA/Passkey architecture.

### Phase 8 — Invite System
- Invite creation, revocation, disabling, usage and expiration.
- Secure random invite generation and hashed invite codes.

### Phase 9 — Team Login / Re-login
- Existing team members can log in again without a new invite.
- Valid session on `/login` redirects to dashboard.

### Phase 10 — Role System
- Roles: OWNER, ADMIN, SUPPORT.
- Server-side permission middleware.
- Never trust frontend role/permission data.

### Phase 11 — Dashboard UI
- Dark, responsive, mobile-first dashboard.
- Overview, Licenses, Keys, Products, Scripts, Users, HWID, SafeLinkU, Discord, Analytics, Audit Logs, Invites, Security and Settings.

### Phase 12 — Dashboard Overview
- License/user/script/claim/HWID metrics.
- 24H, 7D, 30D and 90D analytics.
- Recent activity.

### Phase 13 — Products
- Product CRUD, status, description and version management.

### Phase 14 — License System
- License generation, redemption, expiration, revocation, extension and HWID reset.
- Statuses: UNUSED, ACTIVE, EXPIRED, REVOKED, BANNED.
- Never expose plaintext secrets or license hashes.

### Phase 15 — License UI
- License listing/detail pages, filters, search, pagination and safe actions.

### Phase 16 — HWID
- Device binding, device limits, validation, reset, cooldown, block/unblock.
- Server-side HWID validation.

### Phase 17 — Lua Script Manager
- Lua upload, metadata, new versions, release notes, active/disable/delete.
- Uploaded Lua must never be executed by the server.

### Phase 18 — Script Versioning
- Script versions with file reference, release notes and ACTIVE/ARCHIVED/DISABLED status.

### Phase 19 — Script ↔ License Authorization
- Authentication + account + license + expiration + product + permission + HWID validation before delivery.

### Phase 20 — Secure Delivery
- No permanent public script URLs.
- Use short-lived authorization/signed delivery where appropriate.

### Phase 21 — SafeLinkU
- Official SafeLinkU API integration only.
- Server-side API key.
- Never invent undocumented endpoints or fake verification.

### Phase 22 — Get Key
- Public Get-Key website.
- Product selection → official SafeLinkU flow → Frezen API → authorized license generation/display.

### Phase 23 — Claim Protection
- Rate limiting, cooldowns, duplicate-claim protection, claim history and abuse protection.

### Phase 24 — Discord Bot
- discord.js bot using Frezen API as source of truth.
- No separate license database in the bot.

### Phase 25 — Discord Redeem
- Secure license redemption and Discord account linking.

### Phase 26 — Discord Get Script
- Validate Discord identity, license, product, status, expiration, HWID and permission before delivery.

### Phase 27 — Discord HWID
- Secure HWID reset with ownership, license, status, cooldown and permission checks.

### Phase 28 — Discord Stats
- Private license/product/status/expiration/HWID/activation/last-seen/reset statistics.

### Phase 29 — Analytics
- License, redemption, script request, SafeLinkU claim, HWID reset and failed-request analytics.

### Phase 30 — Audit Logs
- Central audit events for authentication, invites, access denial, licenses, HWID, scripts, SafeLinkU, Discord, rate limiting, settings and lockdown.

### Phase 31 — Security Center
- Authentication, Cloudflare, WAF, rate limiting, session security and 2FA/security-event status.

### Phase 32 — API Management
- Owner-controlled API key creation, rotation, revocation, expiration and scopes.
- Store secrets safely; hash where appropriate.

### Phase 33 — API Security
- Authentication, authorization, role/permission checks, ownership, validation, rate limiting, security headers, restricted CORS and CSRF protection where required.

### Phase 34 — Cloudflare Security
- DNS, HTTPS, Workers, D1, WAF, rate limiting and optional Cloudflare Access for admin protection.

### Phase 35 — Emergency Lockdown
- Owner-only lockdown.
- Disable script delivery, Get Key, redemption and team dashboard while retaining Owner access.

### Phase 36 — Maintenance Mode
- Owner-controlled maintenance mode with public maintenance response and Owner access.

### Phase 37 — Notifications
- License expiration, HWID reset, failed login, security, SafeLinkU and Discord notifications.

### Phase 38 — Backup / Recovery
- Database backup, retention, export, restore, recovery and secret rotation documentation.

### Phase 39 — Testing
- Full automated/manual testing across authentication, private access, invites, licenses, HWID, scripts, SafeLinkU, Discord, security and responsive UI.

### Phase 40 — Security Audit
- Verify no secrets, plaintext passwords, public admin registration, authorization bypass, client-controlled permissions/status/HWID, permanent public script URLs or unrestricted sensitive APIs/CORS.

### Phase 41 — Android Testing
- Termux/Acode clone, install, run, build, Git, deploy and mobile browser/file-picker testing.

### Phase 42 — Windows Testing
- VS Code/PowerShell/Git/Node/npm/Wrangler and Chrome/Edge/Firefox testing.

### Phase 43 — Production Preparation
- Production D1, Worker, secrets, domain, HTTPS, Cloudflare, WAF, rate limits, backup, monitoring and private GitHub repository.

### Phase 44 — Deployment
- Deploy database, Worker, dashboard, Get Key, Discord Bot and domain.
- Production smoke tests.

### Phase 45 — Final Verification
- Verify every production-ready checklist item and security requirement before declaring the project complete.

## Development Rules

1. Work sequentially; do not skip phases.
2. Inspect the repository before every phase.
3. Do not assume infrastructure, database, domain, bot or secrets already exist.
4. Never commit `.env`, tokens, passwords or private secrets.
5. Use `.env.example` for documentation only.
6. Authentication and authorization must be server-side.
7. Never trust client-provided roles, permissions, license status or HWID validation.
8. Never execute uploaded Lua on the server.
9. Use official SafeLinkU documentation; never invent endpoints or fake verification.
10. Do not build credential theft, credential hiding or unauthorized-access mechanisms.
11. Preserve completed functionality unless a deliberate migration requires otherwise.
12. Every phase requires tests and verification.
13. A phase is not complete merely because GitHub Checks pass.
14. After implementation: test → PR → Checks → fix failures → merge → deploy → production test.
15. After completing a phase, STOP and wait for explicit instruction to continue.
16. Never claim 100% completion until Phase 45 Final Verification passes.

## Current Project State

The repository has already implemented and merged several backend foundations and license-related improvements. These must be audited against the numbered Master Build Roadmap above rather than being treated as automatic completion of unrelated phases.

Known completed/merged work includes authentication, D1/license foundations, license validation, license lifecycle, license audit history and user license summary. Exact phase completion must be verified against the roadmap and production behavior.

**Current rule:** Before starting the next feature, audit the current repository and map existing work to the Master Build Roadmap. Do not invent a Phase 6E. The Master Build Roadmap defines Phase 6 as **Private Access**.

## Production Definition of Done

FREZEN CONTROL SYSTEM V3 is production-ready only when:

- All Phase 0–45 requirements are implemented or explicitly verified.
- Automated/manual tests pass.
- Security audit passes.
- Production deployment succeeds.
- D1 migrations/schema are verified in production.
- Production smoke tests pass.
- Backup/recovery is documented and tested where applicable.
- Final Phase 45 verification passes.
