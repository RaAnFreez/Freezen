# Phase 1 — Architecture

## Purpose

Define the production architecture for FREZEN CONTROL SYSTEM V3 before implementing the remaining feature phases.

## System of record

Cloudflare D1 is the persistent data store for Frezen-owned application state. The Frezen API is the server-side source of truth for authentication, authorization, users, licenses, scripts, HWID/device state, claims, audit events and settings.

The Discord Bot must call the Frezen API rather than maintaining a separate license database.

## High-level architecture

```text
                         INTERNET
                            |
                            v
                       CLOUDFLARE
                            |
                 +----------+----------+
                 |                     |
                 v                     v
             GET KEY              PRIVATE PANEL
                 |                     |
                 |                     v
                 |               AUTH SYSTEM
                 |                     |
                 +----------+----------+
                            |
                            v
                       FREZEN API
                            |
                            v
                       CLOUDFLARE D1
                            |
                +-----------+-----------+
                |           |           |
                v           v           v
             LICENSE      SCRIPT       HWID
                |           |           |
                +-----------+-----------+
                            |
                            v
                         SAFELINKU

                  DISCORD BOT
                       |
                       v
                  FREZEN API
```

## Trust boundaries

### Public boundary

The Get-Key application is public. It may expose only data and actions explicitly designed for public use. It must never expose admin functionality, API credentials, internal database details or private script storage.

### Private boundary

The dashboard is private. Authentication and authorization are enforced by the server/API. Frontend visibility is not a security boundary.

### API boundary

Every sensitive API operation validates authentication, authorization, input and resource ownership where applicable. Client-provided role, permission, license status or HWID decisions are not trusted.

### Integration boundary

SafeLinkU and Discord are external integrations. They call or are called through controlled API boundaries. External systems must not become an independent source of truth for Frezen license state.

## Core components

### Frezen API / Worker

Responsibilities:

- authentication and sessions
- authorization and permissions
- user/account state
- invite validation
- product and license operations
- HWID/device authorization
- script metadata and delivery authorization
- SafeLinkU integration boundary
- Discord integration boundary
- audit/security events
- maintenance and lockdown controls

### Cloudflare D1

Persistent application data. Database access is server-side through the Worker binding. Secrets are not stored in source-controlled migration files.

### Private Dashboard

Authenticated control plane for Owner/Admin/Support roles. It consumes the Frezen API and never bypasses API authorization.

### Public Get-Key

Public-facing flow that will later integrate with official SafeLinkU functionality. It must not fake checkpoints or verification.

### Discord Bot

Built with discord.js in its own workspace. It uses Frezen API endpoints as the source of truth and does not keep a second license database.

### SafeLinkU

External integration. API credentials remain server-side. Endpoints are implemented only from official documentation available at implementation time.

## Authorization flow

```text
Request
  |
  v
Authentication
  |
  +---- invalid ----> 401/403
  |
  v
Authorization / Permission
  |
  +---- denied ------> 403
  |
  v
Resource validation
  |
  v
D1 operation / external integration
  |
  v
Safe response
```

## License/script/HWID relationship

A future script delivery request must be authorized using server-side state:

```text
Authenticated requester
        |
        v
Account status
        |
        v
License exists + status
        |
        v
Expiration
        |
        v
Product/script authorization
        |
        v
HWID/device authorization
        |
        v
Short-lived delivery authorization
        |
        v
Script delivery
```

Uploaded Lua is treated as data. The server must not execute uploaded Lua code.

## Security architecture requirements

- Secrets use Cloudflare/host secret management or local ignored environment files.
- `.env` and `.dev.vars` remain ignored.
- No permanent public script URLs for protected scripts.
- Sensitive endpoints require authentication and authorization.
- Rate limiting is applied where required.
- Security headers and restricted CORS are part of the later API security phase.
- Audit/security events are server-generated.
- Emergency lockdown and maintenance mode are server-controlled.

## Environment separation

The architecture supports:

- development
- staging
- production

Environment-specific bindings, data and secrets must not be mixed.

## Phase 1 scope boundary

This document defines architecture only. It does not claim that the dashboard, Get-Key site, Discord Bot, SafeLinkU integration, complete license system, HWID system or script delivery system are already implemented.

Those are later roadmap phases.

## Phase 1 verification checklist

- [x] Public Get-Key and private panel are defined as separate trust surfaces.
- [x] Frezen API is the server-side authorization boundary.
- [x] Cloudflare D1 is the application data store.
- [x] Discord Bot is defined to use Frezen API as source of truth.
- [x] License, Script and HWID authorization is server-authoritative by design.
- [x] Uploaded Lua is treated as data and is not executed by the server.
- [x] SafeLinkU is an external integration boundary using official documentation only.
- [x] Development/staging/production separation is defined.
- [x] Phase 1 explicitly avoids claiming future features are already implemented.

## Next phase

After this Phase 1 architecture PR passes all checks and is merged, the next roadmap phase is **Phase 2 — Project Initialization**. Do not start Phase 2 until explicitly instructed.
