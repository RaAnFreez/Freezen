Automatic Lua upload profile:

- Maximum Multi-Layer source protection
- Very High public strength (100 protection level) retained for API/UI compatibility
- Profile version 1.2
- Three reversible string layers: rolling additive mask, modular arithmetic substitution, reverse-order permutation
- Conservative identifier mangling
- Integer/constant masking
- Token-safe comment removal and minification
- No runtime anti-debug layer
- No control-flow flattening
- No custom VM layer
- No Lua bytecode compilation inside the Cloudflare Worker
- Plain Lua source is still required at upload; the Worker obfuscates after validation
- Generated protection helpers use Lua 5.1-compatible constructs

The upload wrapper transforms the file before the existing script-version persistence endpoint sees it. The existing keyed loader then returns the persisted transformed payload.

No D1 migration is required. Existing stored versions are not rewritten by this change.
