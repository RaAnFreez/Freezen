Automatic Lua upload profile:

- Advanced Techniques v1.1
- Very High strength
- Protection 100%
- XOR string encoding
- Name mangling
- String/number encoding
- Control-flow protection
- Conservative control-flow flattening when safe
- Dead-code injection
- Anti-debug checks
- Minification

The upload wrapper transforms the file before the existing script-version persistence endpoint sees it. The existing keyed loader then returns the persisted transformed payload.