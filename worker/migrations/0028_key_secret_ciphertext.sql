-- Key management V2: encrypted recovery/view data for Owner-only key viewing.
-- The plaintext key is never stored; only AES-GCM ciphertext is stored.

ALTER TABLE frezen_key_records ADD COLUMN key_secret_ciphertext TEXT;
