# Frezen Lua size limits

- Plain Lua source uploads remain limited to 3 MiB while the current in-memory Worker compiler is used.
- VM v4/v5 generated output now supports up to 20 MiB.
- VM encoding uses larger source chunks to reduce per-record metadata overhead; the runtime validation and native Lua/Luau loading behavior remain unchanged.
- Protected payload/source pairs whose combined size is too large for one D1 row are stored in the environment's `SCRIPT_PAYLOADS` R2 bucket. D1 retains short references and metadata; no migration or rewrite of existing versions is required.
- Source V1.1 keeps its existing 3 MiB generated-output cap.
