# Script Obfuscation Contract

New Lua version uploads are routed through the Worker obfuscation wrapper before the existing script-version API persists the file.

Profile: Maximum Multi-Layer v1.2  
Strength: Very High (100 protection level)  
String protection: 3 reversible layers  
Generated helper compatibility: Lua 5.1+ compatible  
Maximum source size: 3 MiB  
Maximum obfuscated output size: 3 MiB

The current source-level pipeline applies conservative identifier mangling, integer masking, multi-layer string protection, token-safe minification, and comment removal. It deliberately does not inject control-flow flattening, runtime anti-debug code, a custom VM, or bytecode because those layers can break Lua/Luau semantics and are not available as a safe universal transform inside the Cloudflare Worker.

The persisted script_files.content is therefore the transformed payload. The existing keyed loader already returns the persisted file content, so runtime delivery uses the protected payload rather than the dashboard source editor contents.

No D1 migration is required. Existing stored versions are not rewritten by this change. Uploading a new source version uses the new profile.
