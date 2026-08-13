# Frezen Get Key — Phase 22

Public GET KEY website for Frezen Control System V3.

## Routes

- `GET /get-key` — public UI.
- `GET /api/v1/get-key/products` — returns only ACTIVE products and non-sensitive metadata.
- `POST /api/v1/get-key/claim` — starts the official SafeLinkU verification flow.

## Security

- No authentication secrets are exposed to the browser.
- `SAFELINKU_API_KEY` remains server-side.
- The client cannot submit a license key or license status to authorize itself.
- No fake SafeLinkU checkpoint is generated.
- No permanent script URL is created.
- The claim route fails closed until the official SafeLinkU claim/checkpoint API contract is configured.

## Current limitation

SafeLinkU claim/checkpoint issuance is intentionally not invented. Until the official API endpoint and response contract are configured, `/api/v1/get-key/claim` returns an explicit unavailable response and does not generate a license.
