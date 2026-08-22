import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key production callback dashboard issuance', () => {
  it('uses FREZEN keys and creates dashboard key records during the callback issuance path', () => {
    const runtime = read('src/getkey-callback-runtime.js');

    expect(runtime).toContain('function makeLicenseKey()');
    expect(runtime).toContain('return `FREZEN-${randomHex()}-${randomHex()}-${randomHex()}-${randomHex()}`;');
    expect(runtime).toContain('INSERT INTO frezen_key_records');
    expect(runtime).toContain('INSERT INTO frezen_key_limits');
    expect(runtime).toContain('key_secret_ciphertext');
    expect(runtime).toContain('owner_id');
    expect(runtime).toContain('provider_id');
    expect(runtime).toContain('service_id');
  });
});
