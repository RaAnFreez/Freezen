# Frezen Layered VM v4

## Design goals

VM v4 replaces the old custom semantic interpreters with a layered payload wrapper that delegates Lua semantics to the target runtime. This is intentional: the previous interpreter needed to reimplement Lua scoping, function calls, varargs, nil values, methods, and runtime-specific globals, creating repeated behavior regressions.

## Runtime pipeline

1. The original UTF-8 source is split into short byte chunks.
2. Every chunk is encoded into a per-build randomized printable nibble alphabet with an affine byte transform.
3. The encoded chunk payload is transformed again into a second printable layer using a separate randomized alphabet and affine parameters.
4. A per-build randomized instruction dispatcher reconstructs chunks in source order. Random no-op entries make the dispatch layout vary between builds.
5. The runtime validates the reconstructed byte length, additive checksum, rolling checksum, and line count.
6. Only after validation, it compiles the source with the available native `loadstring` or `load` function and executes it in the payload's environment where supported.

The output starts with exactly the single Frezen watermark:

```lua
-- This file obfuscation with Frezen Obfuscation
```

## Compatibility and scope

The generated wrapper uses Lua 5.1-era syntax and avoids bitwise-only operations. Actual source parsing and execution are handled by the Lua/Luau runtime instead of a custom semantic interpreter. The automated Luau integration cases cover loops, functions, varargs, nil arguments/returns, method calls, Unicode strings, and an executor-like environment with mocked `Instance` and `game:GetService`.

The encoder refuses empty source, source larger than 3 MiB, and output larger than 3 MiB. Since two printable layers expand data, the maximum accepted input is lower than the output limit for some scripts. The wrapper relies on the target runtime exposing `loadstring` or `load`; runtimes that disable both cannot run this profile.

## Security boundary

The layers are randomized reversible obfuscation, not cryptographic encryption. To preserve ordinary Lua semantics, the source is reconstructed in memory immediately before native compilation. Someone who controls or instruments the executor can potentially intercept the reconstructed source, hook the loader, or inspect runtime state. VM v4 therefore improves resistance to static inspection; it does not guarantee that a script is impossible to dump or deobfuscate.

VM v4 does not disable `debug`, `string.dump`, `loadstring`, or standard globals. It does not include crash-on-inspection, segfault tricks, or global-function replacements, because these can break legitimate scripts and do not provide a reliable security boundary.

## Migration behavior

- New uploads using legacy mode names `vm-v1`, `vm-v2`, or `vm-v3` are normalized to `vm-v4`.
- The dashboard exposes the compatible `source-v11` mode and the new layered `vm-v4` mode only.
- Previously stored payloads are not rewritten automatically. When their source is edited through the delivery editor without an explicit mode, retired VM artifacts are rebuilt with VM v4.
- No D1 migration, database reset, secret rotation, or architecture change is required.
