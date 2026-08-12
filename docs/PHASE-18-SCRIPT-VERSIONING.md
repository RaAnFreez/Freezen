# Phase 18 — Script Versioning

## Scope

Phase 18 formalizes the version lifecycle for the Lua Script Manager. The repository already contains the core `script_versions` schema from the foundational database work and the Phase 17 manager already creates, lists and activates versions. This phase closes the remaining lifecycle gap by making archived/disabled transitions explicit and documented.

## Version model

Each version belongs to exactly one script:

- `id`
- `script_id`
- `version`
- `file_reference`
- `release_notes`
- `status`
- `created_at`

Allowed statuses:

- `ACTIVE` — the one version currently selected for a script.
- `ARCHIVED` — retained historical version that is not currently delivered.
- `DISABLED` — version retained for history but explicitly prevented from activation.

The database enforces `UNIQUE(script_id, version)` and a partial unique index permitting at most one `ACTIVE` version per script. This is important because application checks alone are not enough to guarantee the invariant under concurrent requests.

## Lifecycle

```text
UPLOAD
  |
  v
ARCHIVED
  |
  +----> ACTIVE ----> ARCHIVED
  |                       |
  +-----------------------+----> DISABLED
```

A newly uploaded version starts as `ARCHIVED`. Activation is explicit. Activating a version archives the previously active version first. A currently active version cannot be disabled directly; it must first be replaced/archived by activating another version.

## API contract

Existing Phase 17 endpoints remain the source of truth:

- `GET /api/v1/scripts/:id` — returns script metadata and version history.
- `POST /api/v1/scripts/:id/versions` — uploads a new version as `ARCHIVED`.
- `PATCH /api/v1/scripts/:id/versions/:versionId/active` — activates a version.

Phase 18 additionally defines the server-side lifecycle operation implemented by `setScriptVersionDisabled` for disabling an archived version. The route must remain behind the existing server-side `scripts:write` authorization boundary when exposed by the Worker router.

## Safety rules

1. Uploaded Lua is data only and is never executed by the Worker.
2. Version state is server-controlled.
3. The client cannot mark a version `ACTIVE` by changing a request body; activation is an explicit server operation.
4. A version must belong to the script identified by the route.
5. A disabled version cannot be activated.
6. An active version cannot be disabled directly.
7. Phase 18 does not deliver script source to users. License/HWID authorization belongs to Phase 19/20.

## Audit events

Version lifecycle changes are recorded through the existing audit system:

- `SCRIPT_VERSION_UPLOADED`
- `SCRIPT_VERSION_ACTIVATED`
- `SCRIPT_VERSION_DISABLED`

## Verification

Checks should verify:

- duplicate version numbers are rejected;
- new versions begin `ARCHIVED`;
- activation changes the old active version to `ARCHIVED`;
- only one version can be `ACTIVE` for a script;
- disabled versions cannot be activated;
- active versions cannot be disabled directly;
- script/version ownership is checked server-side;
- uploaded source remains data and is never executed.
