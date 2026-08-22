import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key dashboard license sync', () => {
  it('uses the Frezen key prefix and persists a dashboard key record', () => {
    const adapter = read('src/getkey-single-claim-service-id.js');

    expect(adapter).toContain("return `FREZEN-${randomHex()}-${randomHex()}-${randomHex()}-${randomHex()}`;");
    expect(adapter).toContain('INSERT INTO frezen_key_records');
    expect(adapter).toContain('INSERT INTO frezen_key_limits');
    expect(adapter).toContain('key_secret_ciphertext');
    expect(adapter).toContain('owner_id');
  });
});
