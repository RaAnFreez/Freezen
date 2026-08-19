import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('key secret storage contract', () => {
  it('adds the encrypted key secret column without changing the legacy key hash', () => {
    const migration = read('migrations/0028_key_secret_ciphertext.sql');
    expect(migration).toContain('ALTER TABLE frezen_key_records ADD COLUMN key_secret_ciphertext TEXT');
    expect(migration).not.toContain('DROP TABLE');
    const module = read('src/key-secret.js');
    expect(module).toContain('AES-GCM');
    expect(module).toContain('FREZEN_MASTER_SECRET');
  });
});
