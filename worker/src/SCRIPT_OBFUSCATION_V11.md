# Script Obfuscation Contract

New Lua version uploads are routed through the Worker obfuscation wrapper before the existing script-version API persists the file.

Profile: Advanced Techniques v1.1  
Strength: Very High  
Protection level: 100%  
String encoding: XOR  
Maximum source size: 3 MiB  
Maximum obfuscated output size: 3 MiB

The persisted `script_files.content` is therefore the transformed payload. The existing keyed loader already returns the persisted file content, so runtime delivery uses the obfuscated payload rather than the dashboard source editor contents.

No D1 migration is required. Existing stored versions are not rewritten by this change.
