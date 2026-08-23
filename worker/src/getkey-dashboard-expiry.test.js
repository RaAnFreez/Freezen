import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key dashboard expiry sync', () => {
  it('does not create Get-Key dashboard keys as forever', () => {
    const source = read('src/getkey-single-claim-service-id.js');
    expect(source).toContain('VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, 0, 0)');
  });
});
