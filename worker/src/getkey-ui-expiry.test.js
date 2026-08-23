import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key custom slug expiry UI', () => {
  it('labels the completed-key timer as Expired Key and resets after 24h', () => {
    const source = read('src/entry-ui-getkey.js');
    expect(source).toContain("const KEY_VALIDITY_MS = 24 * 60 * 60 * 1000");
    expect(source).toContain("expiryLabel.textContent = 'Expired Key'");
    expect(source).toContain("location.replace(next.toString())");
  });
});
