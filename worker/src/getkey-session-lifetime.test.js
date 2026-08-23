import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key claim lifetime', () => {
  it('uses a 24-hour claim lifetime and non-forever dashboard records', () => {
    const source = read('src/getkey-single-claim-service-id.js');
    expect(source).toContain('const CLAIM_MAX_AGE = 24 * 60 * 60');
    expect(source).toContain('expires_at = ?2');
    expect(source).toContain('premium, forever)');
    expect(source).toContain('0)`');
  });
});
