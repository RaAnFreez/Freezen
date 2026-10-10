# Frezen Layered VM v5 — Manifest-Sealed Integrity Layer

VM v5 builds on the tested VM v4 payload format. It keeps both randomized printable encoding layers and the same native Lua/Luau execution path, then adds an integrity layer over encoded records and the dispatcher program.

## Runtime path

1. The upload is split into UTF-8 byte chunks.
2. Each chunk is encoded with randomized printable nibble parameters and then wrapped by a second independently randomized printable transform.
3. Pool records remain shuffled and dispatcher opcodes/decoy no-op instructions vary per build.
4. Before decoding any chunk, the runtime calculates a per-record seal over the record key, payload text, transform parameters, lengths, and alphabets. A mismatch stops execution before compiling the user script.
5. The runtime calculates a manifest seal over every dispatcher opcode/operand in execution order. Changed order, changed operands, or removed/inserted instruction records are detected before decoding.
6. The existing decoded-source length, additive checksum, rolling checksum, and newline-count checks still run.
7. The source is then handed to native `loadstring`/`load`, preserving the target runtime's Lua/Luau semantics.

The generated file starts with exactly one Frezen watermark:
`-- This file obfuscation with Frezen Obfuscation`.

## Compatibility and migration

- VM v4 remains available as a known-good fallback.
- VM v5 is available in both the Scripts and Script Delivery protection selectors.
- The same loader/environment compatibility path is used; VM v5 does not create a custom semantic interpreter.
- No D1 migration is needed, and stored versions are not rewritten automatically.
- The new uploader returns `VM_V5_DISABLED` when the existing `FREZEN_VM_ENABLED` Worker setting is disabled.

## Security boundary

The integrity layer detects casual edits, broken payload records, and changed dispatcher layout before running the embedded script. Its record/manifest seals are deliberately Lua 5.1-compatible checks, **not cryptographic authentication**: an analyst who understands and patches the generated checker could recalculate them. The two encoding layers are randomized reversible obfuscation, not encryption.

As with v4, source is reconstructed in memory immediately before native compilation. A person who controls/instruments the executor can potentially intercept that source or hook the loader. VM v5 does not disable standard globals, overwrite `debug` or `string.dump`, install dummy logging functions, or use crash-on-inspection tricks, because those approaches can break legitimate scripts without creating a reliable security boundary.

## Validation plan

Automated Luau tests cover ordinary execution, functions, loops, varargs, explicit `nil` values, method calls, Unicode, executor-like global environments, Lua 5.1 reader-style `load` fallback, randomized output, and rejection of a modified encoded record. A green CI run is required before enabling v5 in production; actual target-executor tests remain necessary.
