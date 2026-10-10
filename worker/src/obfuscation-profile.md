# Frezen Lua Protection Profiles

## Source v1.1 profile

- String-pool protection, identifier mangling, constant masking, and token-safe minification.
- Plain Lua source is validated before transformation.
- This profile avoids custom VM execution and is the lighter compatibility option.

## Frezen Layered VM v4 profile

- Two randomized printable encoding layers over chunked UTF-8 source.
- Per-build random dispatcher opcodes, shuffled payload records, and harmless no-op entries.
- Runtime length, additive checksum, rolling checksum, and line-count validation.
- Native Lua/Luau loading is used after validation to preserve functions, varargs, nil values, method calls, Unicode, closures, and runtime-specific globals.
- Generated VM output limit: 5 MiB. Source upload limit remains 3 MiB until the compiler is refactored for streaming, because the current Worker compiler materializes the source and transformed output in memory.
- Larger source/output pairs are split into 384 KiB chunks in the additive `script_payload_chunks` D1 table, keeping each row below D1's 2 MB limit without an R2 bucket.
- Runtime loader supports `loadstring`, modern `load`, and Lua 5.1 reader-style `load` fallback.
- The generated output begins with exactly one watermark: `-- This file obfuscation with Frezen Obfuscation`. The watermark occupies line 1 and the generated payload is compacted onto line 2 by default.

## Limits

The Worker does not compile the source into platform bytecode. Layer encoding is randomized reversible obfuscation, not cryptographic encryption. The original source is reconstructed in memory before native compilation and can potentially be captured by someone who controls the execution runtime. There is no crash-on-inspection or global-function replacement.

Both profiles share the existing upload/version storage flow. Old VM engines are retired from new uploads; legacy stored outputs are not rewritten automatically. No D1 migration is required.

## Frezen Layered VM v5

VM v5 preserves the tested two-stage chunk payload and native Lua/Luau loader from v4, then adds a third logical **integrity** layer: per-record seals and an execution-order manifest seal checked before payload decoding. Existing decoded-source integrity checks remain in place. See `FREZEN_LAYERED_VM_V5.md` for the exact behavior and limits.

These seals are compatibility-friendly integrity checks, not cryptographic authentication. They detect ordinary payload edits but do not make client-side code impossible to inspect or patch. VM v4 remains the fallback mode, and no stored version is rewritten automatically.
