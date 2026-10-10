# Frezen Lua size limits

- Plain Lua source uploads remain limited to 3 MiB with the current in-memory Worker compiler.
- VM v4/v5 generated output supports up to 5 MiB; Source v1.1 output retains its 3 MiB cap.
- VM encoding uses larger source chunks to reduce per-record metadata overhead.
- When source plus protected output exceeds the conservative 1.2 MB inline-row threshold, Frezen stores the text as 384 KiB UTF-8 chunks in an additive `script_payload_chunks` D1 table and keeps short pointers in the existing version row. This avoids R2 and does not require a D1 reset or migration file.
- Existing versions stored directly in D1 continue to work. The new chunk table is created lazily by the Worker and only used for larger versions.
