import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Custom Get-Key launch link UI', () => {
  it('wraps the public Get-Key page and enhances the launch action', () => {
    const entry = read('src/entry-ui-getkey.js');
    const helper = read('src/getkey-custom-page-ui.js');
    expect(entry).toContain("enhanceGetKeyPage");
    expect(entry).toContain('const page = publicGetKeyPage(');
    expect(helper).toContain("?json=1");
    expect(helper).toContain('SafeLinkU checkpoint ready');
    expect(helper).toContain('safelinku-open-button');
  });

  it('keeps the legacy redirect path available for non-JSON launches', () => {
    const source = read('src/getkey-single-claim.js');
    expect(source).toContain("url.searchParams.get('json') !== '1'");
    expect(source).toContain("status: 'ok', url: location");
  });
});
