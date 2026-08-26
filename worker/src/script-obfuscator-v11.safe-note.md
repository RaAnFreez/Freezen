# Obfuscator v1.1 compatibility policy

The v1.1 worker obfuscator uses a compatibility-first transform pipeline. It intentionally avoids whole-chunk control-flow wrapping/flattening and runtime anti-debug code because those transforms can silently change Lua/Luau semantics without producing a useful console error.

Safe transforms are limited to lexical-safe literal encoding, conservative integer encoding, and token-aware formatting. Local-name mangling is only applied when the source can be classified as a simple, non-shadowing local scope; otherwise names are preserved.
