# Android Engine: owned Frezen backend integration

## Scope

Frezen Engine is a clean-room Android companion. Screenshot capture, calibration, visual detection, collision estimates and shot-map geometry run on-device. This integration does **not** patch the installed SE APK, reproduce SE's private API, or attempt to take over SE's backend. It replaces remote-service assumptions in the Frezen implementation with the owner's existing Frezen Worker API.

The Android adapter is tracked in `android-engine/FrezenBackendClient.kt`; the standalone Android source snapshot is version 0.9.0.

## Configured API base

The Android build uses `FREZEN_API_BASE_URL`, defaulting to `https://frezen.my.id`. A custom owner-controlled HTTPS domain can be supplied at build time. An empty value forces local-only mode. The client rejects non-HTTPS configuration, URL user-info/query/fragment, and HTTP 3xx redirects, so it will not follow a server redirect to a different host.

## Routes

- `GET /api/v1/status`: optional status check, made only after the user presses **CHECK** in the app. It sends no license key, HWID, screenshot, or game data.
- `POST /api/v1/client/license/validate`: optional adapter for first-party Frezen product licensing. The request body contains `product_id`, `license_key` and `hwid`. The Worker remains authoritative for license status, expiry, product match and HWID binding. Failures do not become a valid entitlement.

## Current Worker safety gate

In `worker/src/index.js`, the license route returns 404 unless `FREZEN_CLIENT_LICENSE_API_ENABLED === "true"`. In `worker/wrangler.toml`, that flag is currently `false` for staging and production. The source comment explains the reason: configure Cloudflare rate limiting and test staging before enabling this public client API.

This change intentionally does **not** enable the public license endpoint in production, alter D1, add a migration, or deploy the Worker. Before using license validation:

1. Configure a Cloudflare rate-limit/WAF rule for `/api/v1/client/license/validate`.
2. Enable the flag in staging only and test valid, unknown, expired, revoked, disabled-product, malformed and HWID/device-limit cases.
3. Confirm rate limits, audit behaviour and response privacy in staging.
4. Enable production only after the staging test and owner review.

Never embed a server secret or Cloudflare token in the APK. If the base URL is blank or the server is unavailable, local vision features remain available; the app must not infer a valid server-side license from that offline condition.

## Verification checklist

- No SE/NK MOD hostnames or private URLs in the Frezen Android client.
- No runtime source/native-code download.
- Network calls are limited to the configured owner's HTTPS host and only occur on explicit status/license actions.
- Redirects are rejected.
- Vision and shot-map calculations remain local.
- Production Worker, production D1, migrations and deploy workflows are unchanged by this adapter PR.
