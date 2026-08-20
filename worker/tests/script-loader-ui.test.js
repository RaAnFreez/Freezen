import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Script loader UI integration', () => {
  it('uses the Frezen keyed server-file loader and canonical dashboard integration', () => {
    const panel = read('public/dashboard/scripts-panel.js');
    const bridge = read('public/dashboard/script-loader-ui.js');
    const keyActions = read('public/dashboard/script-key-actions.js');
    const hub = read('public/dashboard/dashboard-integration-hub.js');
    const html = read('public/dashboard/index.html');

    expect(panel).toContain('script_key="PASTE YOUR KEY HERE"');
    expect(bridge).toContain('/files/');
    expect(bridge).toContain('.lua');
    expect(bridge).toContain('HttpService:UrlEncode(script_key)');
    expect(bridge).toMatch(/Frezen (?:uses its own keyed loader|keyed loader uses|server-file)/i);
    expect(bridge.toLowerCase()).not.toContain('luarmor');
    expect(keyActions).toContain('FrezenIntegration.generateKeyForScript');
    expect(keyActions).toContain('Generate Key');
    expect(hub).toContain('/api/v1/dashboard/state');
    expect(hub).toContain('/api/v1/key-system/sync');
    expect(hub).toContain('ensureScriptBinding');
    expect(hub).toContain('generateKeyForScript');
    expect(hub).toContain('max_hwids_per_key');
    expect(hub).toContain('D1 is the canonical source');
    expect(html).toContain('/dashboard/dashboard-integration-hub.js?v=integration-v2');
    expect(html).toContain('/dashboard/script-loader-ui.js?v=key-control-v13');
    expect(html).toContain('/dashboard/script-key-actions.js?v=integration-v2');
  });
});
