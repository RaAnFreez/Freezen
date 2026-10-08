# Frezen VM v1

Frezen VM v1 is a compatibility-first runtime packaging layer for Lua 5.1-compatible loaders.

## What it does

The compiler converts the source into byte-oriented VM chunks. Each chunk is transformed with a reversible affine byte layer and placed behind a small instruction dispatcher. The runtime reconstructs the source only in memory immediately before \`loadstring\`/\`load\` executes it.

The existing Frezen source obfuscator remains available as the fallback path.

## Important security boundary

This is **not** an unbreakable or undumpable VM. Because execution happens on a client-controlled runtime, a sufficiently capable analyst can instrument the runtime and observe reconstructed source or execution state.

The goal of v1 is to remove plaintext source from the static delivered payload while preserving compatibility with existing Lua scripts. A later semantic VM can replace the \`loadstring\` execution step without changing the artifact contract.

## Watermark

The generated artifact begins with exactly:

\`\`\`
-- This file obfuscation with Frezen Obfuscation
\`\`\`

No second watermark is added.

## Compatibility

The generated runtime intentionally uses Lua 5.1-era constructs only:

- \`while\`, \`if\`, \`for\`
- \`string.byte\`, \`string.char\`
- \`table.concat\`
- \`loadstring or load\`
- \`pcall\`

No bitwise operators are required.

## Current limitation

v1 is a **chunk-dispatch VM**, not a semantic Lua bytecode interpreter. It protects the static payload but still reconstructs and executes the original source at runtime. This is the safest incremental step for keeping existing Frezen scripts functional while the semantic VM is developed separately.
