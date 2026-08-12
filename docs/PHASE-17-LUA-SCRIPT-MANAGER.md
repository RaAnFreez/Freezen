# Phase 17 — Lua Script Manager

## Scope

Phase 17 adds the private dashboard and server-side management API for Lua scripts owned by the project owner.

### Supported operations

- Create a script record and associate it with an active product.
- Upload a new `.lua` version.
- Store release notes and file metadata.
- List/search/filter scripts with pagination.
- View script metadata and version history.
- Activate a selected version.
- Disable/enable a script.
- Delete a script and its versions.
- Record script-manager actions in the existing audit log.

## Upload constraints

- Only filenames ending in `.lua` are accepted.
- Empty files are rejected.
- Maximum uploaded Lua size is 512 KiB.
- Version must use semantic version form such as `1.0.0` or `v1.0.0`.
- File names cannot contain path separators or NUL characters.
- The uploaded source is stored as data; it is never executed, evaluated, imported or interpreted by the Worker.

## Storage

D1 already contains `scripts` and `script_versions` from the Phase 4 schema. Phase 17 adds `script_files` for the source payload and immutable file metadata:

- file name
- content type
- byte size
- source content
- SHA-256 digest
- creation timestamp

The `script_versions.file_reference` points to the stored file record. This keeps the script version metadata separate from the source payload and leaves room for a future object-storage migration without changing the script API contract.

## API

All endpoints require the existing server-side permission middleware.

- `GET /api/v1/scripts`
- `POST /api/v1/scripts`
- `GET /api/v1/scripts/:id`
- `PATCH /api/v1/scripts/:id`
- `DELETE /api/v1/scripts/:id`
- `POST /api/v1/scripts/:id/versions` — multipart upload with `file`, `version`, and optional `release_notes`.
- `PATCH /api/v1/scripts/:id/versions/:versionId/active`

`ADMIN` receives `scripts:read` and `scripts:write`; `OWNER` has full permission through the existing role matrix. `SUPPORT` does not receive script permissions.

## Security

The client does not control authorization, product status, script status or active-version state. The Worker re-checks these conditions server-side.

Script source is not returned by the management list/detail endpoints. The source is only stored for the later authorized delivery phases.

Phase 17 does **not** implement script delivery authorization. That belongs to Phase 19/20 and must validate authentication, account status, license, product, expiration, permission and HWID before delivering any source.

## Verification

Automated coverage is in `worker/tests/phase-17-scripts.test.js` and covers authentication boundary, product validation, `.lua` validation, version validation, data-only storage, activation and listing metadata.
