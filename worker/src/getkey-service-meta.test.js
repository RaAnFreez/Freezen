import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('custom Get-Key service metadata', () => {
  it('resolves a custom slug to an active service and ordered checkpoints', () => {
    const source = read('src/getkey-service-meta.js');
    expect(source).toContain('FROM frezen_key_services WHERE slug = ?1 LIMIT 1');
    expect(source).toContain('FROM frezen_key_providers WHERE service_id = ?1 AND active = 1');
    expect(source).toContain('checkpoint_count: result.checkpoints.length');
  });

  it('keeps metadata read-only and does not create a flow session', () => {
    const source = read('src/getkey-service-meta.js');
    expect(source).not.toContain('INSERT INTO getkey_public_sessions');
    expect(source).not.toContain('UPDATE getkey_public_sessions');
  });
});
