# Frezen VM output up to 20 MiB

## What changed

- VM v4 and VM v5 allow generated output up to 20 MiB.
- VM v4/v5 use a default 1,024-byte source chunk (maximum configurable chunk size: 4,096 bytes) to reduce record/dispatcher overhead.
- Original Lua uploads remain capped at 3 MiB with the current in-memory compiler. A 20 MiB input-source limit needs a streaming/compiler-memory refactor; simply increasing the constant is not safe under the Workers 128 MB isolate memory limit.
- Source v1.1 keeps its existing 3 MiB output cap.
- Large protected source/payload pairs are stored in R2 when their combined size exceeds 1,200,000 bytes. D1 keeps small opaque R2 references plus the existing version metadata. No D1 schema migration or reset is required.
- Existing versions stored directly in D1 continue to work. New R2-backed versions are resolved by the Worker before a source/payload is sent to the editor or loader.

## Required Cloudflare R2 buckets

Create these three R2 buckets in the same Cloudflare account **before merging this PR**:

- `frezen-script-payloads-development`
- `frezen-script-payloads-staging`
- `frezen-script-payloads` (production)

The production Worker deploy workflow runs automatically on pushes to `main`. If the production bucket does not exist when the PR is merged, the deployment can fail. Wrangler binds each environment to its own bucket as `SCRIPT_PAYLOADS`, keeping development, staging, and production objects separated.

## Storage behavior

- Pairs at or below the inline D1 threshold remain unchanged in D1.
- Larger pairs are written as two objects in `SCRIPT_PAYLOADS`: the protected output and the original plain source.
- The D1 `content` and `source_content` fields contain a short `frezen-r2://` pointer for those objects; API responses and loaders resolve the pointer before use.
- Deleting a version/script attempts to remove the associated R2 objects. Cleanup is best-effort so transient R2 delete failures do not break a successful D1 update.

This does not make obfuscation irreversible. It increases supported output size and moves large stored text out of D1.
