# Frezen VM output up to 5 MiB without R2

## Limits

- VM v4 and VM v5 generated output: up to 5 MiB.
- Plain Lua source uploads remain limited to 3 MiB with the current in-memory compiler. A larger source input limit needs a streaming/compiler-memory refactor.
- Source v1.1 keeps its existing 3 MiB output cap.
- VM v4/v5 use a default 1,024-byte source chunk (maximum configurable chunk size: 4,096 bytes) to reduce encoding and dispatcher overhead.

## Storage without an R2 subscription

Cloudflare D1 limits one string/BLOB or table row to 2,000,000 bytes. Frezen keeps source/output pairs inline when their combined UTF-8 size is at most 1,200,000 bytes. Larger pairs are divided into 384 KiB UTF-8 chunks stored in the additive `script_payload_chunks` D1 table; short `frezen-d1://` pointers stay in the existing `script_files` and `delivery_script_files` rows. The Worker resolves those pointers before the dashboard/editor or loader receives Lua code.

The chunk table is lazily created with `CREATE TABLE IF NOT EXISTS`; no production D1 reset or destructive migration is needed. Existing inline versions continue to work. Deleting or updating versions also attempts to delete their associated chunks.

This needs no R2 bucket and introduces no R2 storage or operation charges. It still consumes D1 storage and Worker CPU/memory, so very large scripts may need a smaller limit if they trigger the platform's runtime limits. This limit does not make obfuscation irreversible.
