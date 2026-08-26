# Obfuscator v1.1 compatibility-first fix

The v1.1 Worker obfuscator now avoids whole-chunk control-flow rewriting, control-flow flattening, runtime anti-debug blocks, and broad textual identifier renaming. Those operations can silently alter Lua/Luau semantics even when the runtime console does not report a useful error.

The fixed pipeline keeps source delivery protected with token-safe string encoding, conservative integer encoding, deterministic token-aware formatting, and a 3 MiB limit. Runtime-sensitive constructs are detected and routed through compatibility mode so they are not aggressively rewritten.