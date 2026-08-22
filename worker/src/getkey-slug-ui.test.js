import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('custom Get-Key slug UI', () => {
  it('uses the dedicated slug page renderer and service metadata endpoint', () => {
    const entry = read('src/entry-ui-getkey.js');
    const ui = read('src/getkey-slug-ui.js');
    expect(entry).toContain("renderSlugGetKeyPage(slug)");
    expect(entry).toContain("url.pathname === '/api/v1/get-key/service'");
    expect(ui).toContain("'/api/v1/get-key/service?slug=' + encodeURIComponent(slug)");
  });

  it('does not expose the legacy Get a New Key action', () => {
    const ui = read('src/getkey-slug-ui.js');
    expect(ui.toLowerCase()).not.toContain('get a new key');
    expect(ui).toContain('Progress:');
    expect(ui).toContain('START');
    expect(ui).toContain('CONTINUE');
  });

  it('opens the official checkpoint URL returned by the launch endpoint', () => {
    const ui = read('src/getkey-slug-ui.js');
    expect(ui).toContain("/api/v1/get-key/flow/' + encodeURIComponent(flowId) + '/launch?json=1");
    expect(ui).toContain('location.href = launch.url');
  });
});
