import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key resolver v7', () => {
  it('checks direct slug, alias, then canonical service id', () => {
    const source = read('src/getkey-single-claim-service-id.js');
    expect(source).toContain('FROM frezen_key_services WHERE slug = ?1 LIMIT 1');
    expect(source).toContain('FROM frezen_key_service_aliases');
    expect(source).toContain('FROM frezen_key_services WHERE id = ?1 LIMIT 1');
  });
});
