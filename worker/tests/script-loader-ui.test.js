import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Script loader UI integration', () => {
  it('uses the Frezen keyed loader and does not expose the example external loader', () => {
    const panel = read('public/dashboard/scripts-panel.js');
    const bridge = read('public/dashboard/script-loader-ui.js');
    const html = read('public/dashboard/index.html');

    expect(panel).toContain('script_key="PASTE YOUR KEY HERE"');
    expect(bridge).toContain('/loader/');
    expect(bridge).toContain('HttpService:UrlEncode(script_key)');
    expect(bridge).toContain('Frezen uses its own keyed loader');
    expect(bridge.toLowerCase()).not.toContain('luarmor');
    expect(html).toContain('/dashboard/script-loader-ui.js?v=key-control-v10');
  });
});
