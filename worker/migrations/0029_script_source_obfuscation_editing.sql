-- Source editing and generated obfuscation payloads for both Lua Script Manager and Script Delivery.
-- Existing content is preserved as source during the migration. New uploads and saves
-- populate both the editable source and the generated obfuscated payload.

ALTER TABLE script_files ADD COLUMN source_size_bytes INTEGER;
ALTER TABLE script_files ADD COLUMN source_content TEXT;
ALTER TABLE script_files ADD COLUMN source_sha256 TEXT;

ALTER TABLE delivery_script_files ADD COLUMN source_size_bytes INTEGER;
ALTER TABLE delivery_script_files ADD COLUMN source_content TEXT;
ALTER TABLE delivery_script_files ADD COLUMN source_sha256 TEXT;

UPDATE script_files
SET source_size_bytes = COALESCE(source_size_bytes, size_bytes),
    source_content = COALESCE(source_content, content),
    source_sha256 = COALESCE(source_sha256, sha256)
WHERE source_content IS NULL;

UPDATE delivery_script_files
SET source_size_bytes = COALESCE(source_size_bytes, size_bytes),
    source_content = COALESCE(source_content, content),
    source_sha256 = COALESCE(source_sha256, sha256)
WHERE source_content IS NULL;
