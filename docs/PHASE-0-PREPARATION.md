# Phase 0 — Preparation

## Purpose

Prepare the Frezen Control System V3 development environment without committing or requesting real secrets.

## Supported development environments

### Windows

Required tools:

- Node.js LTS (Node 20+ is required by the current root `package.json`)
- npm
- Git
- VS Code (recommended)
- Wrangler for Cloudflare development/deployment

### Android

Supported workflow:

- Termux for Node.js/npm/Git/Wrangler commands
- Acode for editing project files
- Android browser for UI and production smoke testing

> If Termux package installation has certificate/repository problems, fix the Termux package source/environment first rather than weakening TLS verification.

## Cloudflare prerequisites

Prepare access to:

- Cloudflare account
- Cloudflare Workers
- Cloudflare D1
- Wrangler authentication
- Production domain, when available

Do not place Cloudflare credentials in Git.

## GitHub prerequisites

The project repository is:

`RaAnFreez/Freezen`

Keep the repository private when the project contains private implementation details. Never commit real secrets.

## Discord prerequisites

For the future Discord phases, prepare:

- Discord Developer Application
- Discord Bot
- Client ID
- Guild ID
- Required role IDs

The actual bot token must remain in secret/environment management and must never be committed.

## SafeLinkU prerequisites

For the future SafeLinkU phases, prepare:

- SafeLinkU account
- API credentials, if the official API provides them
- Official SafeLinkU API documentation

Do not invent undocumented endpoints or fake verification. Do not paste real credentials into chat.

## Environment configuration

Use `.env.example` as documentation only. Local real values belong in an ignored `.env`/`.dev.vars` or the appropriate secret store.

Current documented variables include:

- `FREZEN_ENV`
- `FREZEN_API_TOKEN`
- `FREZEN_MASTER_SECRET`
- `SAFELINKU_API_KEY`
- `DISCORD_BOT_TOKEN`
- `DISCORD_BOT_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_BUYER_ROLE_ID`
- `OWNER_EMAIL`
- `OWNER_USER_ID`
- `CLOUDFLARE_ACCOUNT_ID`

Cloudflare Worker production secrets must be configured through Wrangler/Cloudflare secret management rather than committed files.

## Secret handling rules

- Never commit `.env`.
- Never commit API tokens, passwords, bot tokens, private keys, or master secrets.
- Never ask users to paste real secrets into chat.
- Never print secrets in logs or test output.
- Use `.env.example` only for variable names and non-secret documentation.

## Phase 0 verification checklist

- [x] Root Node/npm project exists.
- [x] Node 20+ requirement is documented in `package.json`.
- [x] `.env.example` exists.
- [x] `.gitignore` excludes `.env`, `.dev.vars`, logs and build/runtime artifacts while allowing `.env.example`.
- [x] Worker workspace and Wrangler configuration exist.
- [x] Dashboard, Discord Bot and Get Key workspace directories exist.
- [x] Documentation directory exists.
- [ ] Actual local Node/npm installation verified on every target device.
- [ ] Cloudflare account/Wrangler authentication verified for the current operator.
- [ ] Discord Developer Application/Bot credentials configured (future phase dependency).
- [ ] SafeLinkU account/API availability verified from official documentation (future phase dependency).

## Scope boundary

Phase 0 is preparation/documentation only. It does not create fake integrations, fake credentials, or production secrets. Feature implementation begins in later phases.
