# SE 2.2.6 → Frezen API migration notes

## Intended architecture

This change is for an owner-authorized migration of the SE Android client to the first-party Frezen service. It does not call, proxy to, or preserve a dependency on the original SE/SnakeEngine hostnames. Frezen remains the source of truth for license/key generation and HWID binding/blocking.

The APK is a release Flutter AOT build. The uploaded artifact exposes the following URL strings in `lib/arm64-v8a/libapp.so`:
- `https://rest.snakeseller.com/api/request/`
- `https://www.snakeengine.com/topup/`

The Flutter Dart source and exact legacy JSON request/response contract are not present in the uploaded source archive. The bridge therefore supports the explicitly documented action contract below, but the final patched APK must be exercised against a staging service to confirm its actual fields and response parsing before production is enabled. A string-only URL replacement is not a proof of API compatibility.

## Existing Frezen functionality mapped

- `generate_key` / `create_key`: uses Frezen's existing license creation logic and D1; requires `licenses:write`.
- `list_keys`: uses Frezen's existing license listing logic; requires `licenses:read`.
- `list_hwid`: uses Frezen's existing HWID listing logic; requires `hwid:read`.
- `ban_hwid` / `block_hwid`: updates the existing HWID binding status to blocked; requires `hwid:write`.
- `unban_hwid` / `unblock_hwid`: returns an owned binding to active status; requires `hwid:write`.
- `topup`: returns `501 TOPUP_NOT_IMPLEMENTED`; no payment, balance, or subscription purchase is faked.

The bridge requires a **per-user Frezen API key** in the Authorization Bearer header or one of the body fields `access_token`, `accessToken`, `api_key`, `apiKey`, or `token`. Create the key in the Frezen dashboard with only the scopes that user needs. No Cloudflare or master secret may be stored in the APK.

## Bridge request contract

The compatibility URL is `POST /api/request/`. The expected body is JSON (or URL-encoded form) with `action` plus the operation's inputs:

- Status: `{ "action": "status" }`
- Generate: `{ "action": "generate_key", "product_id": "<Frezen product ID>", "duration_days": 30, "max_devices": 1 }`
- List license keys: `{ "action": "list_keys" }`
- List HWIDs for a license: `{ "action": "list_hwid", "license_id": "<Frezen license ID>" }`
- Block HWID: `{ "action": "ban_hwid", "device_id": "<Frezen HWID binding ID>" }`
- Unblock HWID: `{ "action": "unban_hwid", "device_id": "<Frezen HWID binding ID>" `

The bridge also accepts legacy-style aliases for common operation names, but the exact request fields emitted by the compiled SE APK remain unverified. The APK repoint patch should not be described as production-ready until a full test confirms the actual payload and response model.

## Feature gate and deployment

The route returns 404 unless `FREZEN_SE_COMPAT_ENABLED=true`. Keep it disabled in production while testing. Start in a separate staging Worker and isolated staging D1, configure Cloudflare rate limiting for `/api/request/`, and test valid/invalid keys, roles/scopes, wrong products, expired licenses, HWID ownership, block/unblock, and unsupported top-up.

The proposed APK URL replacement uses same-length hosts so the existing AOT string lengths remain intact:
- API host: `restfrezenapi1.frezen.my.id` (configure this hostname to route to the intended Frezen Worker)
- Top-up placeholder: `topup1.frezen.my.id` (configure this hostname to the Worker; `/topup/` displays that top-up is not available)

These hostnames are proposed routing names; DNS/certificate/Cloudflare Worker routing must be configured by the owner. Do not point the APK at a server that is not configured to answer its requests.

## Build, signature and trust

Editing `libapp.so` invalidates the original APK signature. A rebuilt APK must be signed with a signing key controlled by the owner. It will not update over the original signed SE APK unless the original signing identity is available; otherwise Android will require uninstalling the original before installing the repacked build. Validate with the project's real Android build/signing tooling and test on a non-production device first.
