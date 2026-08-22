import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('SafeLinkU integration delete UI', () => {
  it('exposes a delete action, clears Frezen-side state, and keeps the Worker secret protected', () => {
    const panel = read('public/dashboard/safelinku-panel.js');
    const html = read('public/dashboard/index.html');

    expect(panel).toContain('Delete Integration');
    expect(panel).toContain('localStorage.removeItem(META_KEY)');
    expect(panel).toContain('localStorage.removeItem(CHECKPOINTS_KEY)');
    expect(panel).toContain('/api/v1/safelinku/checkpoints/');
    expect(panel).toContain('The Cloudflare Worker secret is not deleted');
    expect(panel).toContain('Worker Secret');
    expect(html).toMatch(/safelinku-panel\.js\?v=(?:provider-getkey-v|key-control-v)\d+/);
  });
});
