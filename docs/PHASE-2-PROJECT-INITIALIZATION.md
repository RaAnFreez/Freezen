# Phase 2 — Project Initialization

## Objective

Verify and document the repository foundation required by the Master Build Roadmap before moving to Phase 3.

## Repository structure

```text
frezen/
├── dashboard/
├── worker/
├── discord-bot/
├── get-key/
├── migrations/
├── tests/
├── docs/
├── scripts/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

The repository already contains the required top-level workspaces and supporting directories.

## Workspace configuration

The root `package.json` defines the private project, workspaces for `worker`, `dashboard`, `discord-bot`, and `get-key`, plus root `dev`, `build`, `build:all`, `test`, and `deploy` scripts. Node.js `>=20` is required.

The current Worker workspace provides Wrangler development/deployment and Vitest testing. The Dashboard and Get Key workspaces use Vite, while the Discord Bot uses discord.js.

## Git safety

`.gitignore` excludes:

- `node_modules/`
- `.env`
- `.env.*` except `.env.example`
- `dist/`
- `.wrangler/`
- `.dev.vars`
- `*.log`
- `.DS_Store`

No real secret is added by this phase.

## Build/test contract

The intended initialization verification commands are:

```bash
npm install
npm run build
npm run build:all
npm test
```

`npm run build` at the root is intentionally a lightweight orchestration check. `npm run build:all` performs workspace builds where a workspace defines one. `npm test` runs workspace tests where available.

## Phase 2 verification

- [x] Project name/version/package metadata exists.
- [x] Root npm workspaces are configured.
- [x] Worker workspace exists and has Wrangler/Vitest scripts.
- [x] Dashboard workspace exists and has Vite/Vitest scripts.
- [x] Discord Bot workspace exists and uses discord.js.
- [x] Get Key workspace exists and has Vite build scripts.
- [x] Required supporting directories exist.
- [x] `.gitignore` protects local secrets and generated artifacts.
- [x] `.env.example` remains the safe configuration template.
- [x] Phase 0 and Phase 1 documentation is present.
- [x] Phase 2 initialization contract is documented.

## Important limitation

This phase verifies project initialization and does not claim that the future dashboard, Discord Bot, Get-Key functionality, Cloudflare production environment, D1 schema, or integrations are complete. Those belong to later roadmap phases.

## Next phase

After this Phase 2 PR passes CI and is merged, the next roadmap phase is **Phase 3 — Cloudflare**. Do not start Phase 3 until explicitly instructed.
