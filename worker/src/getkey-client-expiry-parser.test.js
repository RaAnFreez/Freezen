import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key client expiry parser', () => {
  it('exposes a browser-safe UTC parser before the slug runtime executes', () => {
    const source = read('src/entry-ui-getkey.js');
    expect(source).toContain('globalThis.parseUtcTimestamp = (value) =>');
    expect(source).toContain('function renderSlugPageWithDirectCheckpointRedirect');
  });
});
