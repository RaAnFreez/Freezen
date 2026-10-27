# Frezen Android Engine adapter

This folder documents the optional first-party backend adapter for the standalone Frezen Engine Android source project. It is intentionally separate from the root Node/Cloudflare workspaces so the existing production Worker and D1 deployment pipeline is not changed by Android build work.

- The visual prediction engine is local-first and can run without a network connection.
- The only server URLs are supplied through Android build configuration as `FREZEN_API_BASE_URL`; the source default is `https://frezen.my.id`.
- The client calls `GET /api/v1/status` only when the user taps **CHECK**.
- The optional license adapter calls `POST /api/v1/client/license/validate` and does not treat network errors as successful validation.
- No SE/NK MOD endpoint, remote-code loader, API secret, or server credential is included.

The complete standalone Android source snapshot is distributed separately as **Frezen Engine v0.9.0 source ZIP** in the conversation. This repository folder tracks the backend adapter and deployment contract; it does not turn the root production Worker repository into an Android Gradle workspace.

## Build configuration

Use the standalone project with JDK 17, Gradle 8.9 and Android SDK platform 35.

```bash
gradle -PFREZEN_API_BASE_URL=https://frezen.my.id assembleDebug
```

For local-only mode with no calls to any server:

```bash
gradle -PFREZEN_API_BASE_URL= assembleDebug
```

Do not place owner tokens, Cloudflare API tokens, or API secrets in the Android build config. A value embedded in an APK is public to the client.
