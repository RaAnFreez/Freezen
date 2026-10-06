# Obfuscator v1.2 maximum multi-layer compatibility fix

The Frezen Worker now replaces the previous XOR-only string layer with a three-stage reversible string transform:

1. rolling additive mask
2. odd-modulus arithmetic substitution
3. reverse-order byte permutation

The rest of the compatibility-first pipeline remains conservative: identifier mangling, integer masking, token-safe formatting/minification, and comment removal.

The generator intentionally does not inject whole-chunk control-flow flattening, runtime anti-debug blocks, a custom VM, or Lua bytecode. Those transforms can silently alter Lua/Luau semantics or require a runtime/compiler that is not available inside the Worker.

Generated protection helpers are limited to Lua 5.1-compatible syntax and standard library primitives such as string.char and arithmetic operators.
