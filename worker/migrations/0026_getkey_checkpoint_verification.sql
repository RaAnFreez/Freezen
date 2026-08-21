ALTER TABLE getkey_checkpoint_flow_items ADD COLUMN verification_token_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_getkey_flow_item_verification_token
  ON getkey_checkpoint_flow_items(verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;
