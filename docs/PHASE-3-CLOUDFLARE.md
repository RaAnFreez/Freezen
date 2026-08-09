# Phase 3 — Cloudflare Worker

## Goal

Run Frezen's backend on Cloudflare Workers and prepare separate development, staging, and production environments.

## Current repository state

The Worker configuration defines three named environments:

- default/development: `frezen-control-system-v3`
- staging: `frezen-control-system-v3-staging`
- production: `frezen-control-system-v3`

No Cloudflare API token, account secret, Discord secret, SafeLinkU key, or master secret is stored in this repository.

## Local development

Install dependencies from the repository root, then run the Worker workspace using the project's npm scripts. Use Cloudflare Wrangler with a locally authenticated account when you are ready to connect a development environment.

## Deployment

Deployments should eventually be automated from GitHub Actions. Cloudflare credentials must be stored as GitHub Actions secrets, never in source files.

Suggested secret names:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The token should have only the minimum permissions required for the intended Worker deployment.

## Environments

Do not point staging and production at the same D1 database. Each environment must have its own D1 database binding once D1 is introduced.

## 24/7 behavior

A deployed Cloudflare Worker is managed by Cloudflare's platform and does not require a laptop, Android phone, Termux session, or continuously running terminal process. The deployment itself still requires an initial Cloudflare configuration.

## Current limitation

Phase 3 source configuration is prepared, but this repository change alone does not prove that a Worker has been deployed. Actual deployment requires access to the user's Cloudflare account and appropriate credentials.
