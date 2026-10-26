# Frezen Client License API (Draft)

This API contract is for **applications intentionally integrated with Frezen's own licensing service**. It does not emulate a third-party subscription API. An existing compiled APK will not begin using it automatically; the client must be adapted to send this request and interpret the response.

## Endpoint

`POST /api/v1/client/license/validate`

The endpoint is opt-in and returns `404` unless the Worker environment variable `FREZEN_CLIENT_LICENSE_API_ENABLED` is exactly `true`.

Request JSON:

```json
{
  "product_id": "product-id-from-frezen",
  "license_key": "FREZEN-....",
  "hwid": "stable-device-identifier"
}
```

The license key is a client credential. Never log or include it in telemetry. Send the device identifier only over HTTPS. The Worker stores a hash of the identifier through the existing HWID v2 service; the raw value is not saved by this endpoint.

## Successful response

```json
{
  "valid": true,
  "license": {
    "id": "license-id",
    "product_id": "product-id-from-frezen",
    "status": "active",
    "expires_at": null,
    "lifetime": true
  },
  "device": {
    "bound": true,
    "newly_bound": false,
    "fingerprint": "12-character-hash"
  },
  "request_id": "..."
}
```

An `expires_at` value of `null` represents lifetime access in Frezen's current license schema. The server remains authoritative: inactive, expired, revoked, banned, wrong-product, disabled-product, blocked-device, and device-limit cases are denied.

## Denial codes

- `INVALID_JSON`, `INVALID_LICENSE_KEY`, `INVALID_PRODUCT_ID`, `INVALID_HWID`: malformed request (400).
- `LICENSE_NOT_FOUND` or `PRODUCT_NOT_FOUND`: missing resource (404).
- `PRODUCT_LICENSE_MISMATCH`, `PRODUCT_DISABLED`, `LICENSE_INACTIVE`, `LICENSE_EXPIRED`, `LICENSE_REVOKED`, `LICENSE_BANNED`, `LICENSE_BLOCKED`, `HWID_BLOCKED`: access denied (403).
- `DEVICE_LIMIT_REACHED`: no device slot available (409).
- `DATABASE_UNAVAILABLE` or `DATABASE_ERROR`: server failure (503).

## Before enabling in any environment

1. Keep the flag disabled while testing locally and in staging.
2. Configure an explicit Cloudflare rate-limiting rule for `POST /api/v1/client/license/validate` before exposing it publicly. The license key has enough value that the route must not be left open to unbounded guessing.
3. Make sure the product and licenses exist in that environment's own D1 database. Do not point staging at production D1.
4. Confirm the app's client contract, product identity, device-ID stability, and expected error behavior.
5. Test a valid license, wrong product, expired/revoked license, first activation, repeated activation on the same device, different device, and device-limit exhaustion.

## Integration limitation

This is a Frezen API for a client that supports the contract above. It is not a drop-in replacement for the current SE 2.2.6 provider: its endpoint path and request/response format have not been verified against that APK's original network protocol. Do not change the APK's server endpoint or binary based on guesses. A legitimate integration needs an agreed client contract and testing showing the actual game is supported by the new backend.
