import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key resolver contract', () => {
  it('checks direct slug then alias then canonical service id', () => {
    const resolver = read('src/getkey-single-claim-service-id.js');
    expect(resolver).toContain('FROM frezen_key_services WHERE slug = ?1 LIMIT 1');
    expect(resolver).toContain('FROM frezen_key_service_aliases');
    expect(resolver).toContain('FROM frezen_key_services WHERE id = ?1 LIMIT 1');
  });
});
