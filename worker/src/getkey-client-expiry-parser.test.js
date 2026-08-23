import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key client expiry parser', () => {
  it('does not call a server-only parser from browser code', () => {
    const source = read('src/getkey-slug-ui.js');
    expect(source).toContain('function parseUtcTimestamp(value)');
    expect(source).toContain('const start = (() => {');
    expect(source).not.toContain('const start=parseUtcTimestamp(generatedAt)');
  });
});
