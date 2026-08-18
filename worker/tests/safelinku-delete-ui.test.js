import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('SafeLinkU integration delete UI', () => {
  it('exposes a delete action and clears Frezen-side integration state', () => {
    const panel = read('public/dashboard/safelinku-panel.js');
    const html = read('public/dashboard/index.html');

    expect(panel).toContain('Delete Integration');
    expect(panel).toContain('localStorage.removeItem(META_KEY)');
    expect(panel).toContain('localStorage.removeItem(CHECKPOINTS_KEY)');
    expect(panel).toContain('checkpoints: []');
    expect(panel).toContain('Worker Secret itself is not exposed to the browser');
    expect(html).toMatch(/safelinku-panel\.js\?v=(?:provider-getkey-v|key-control-v)\d+/);
  });
});
