import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Provider and SafeLinkU dashboard scope', () => {
  it('loads Provider and removes the SafeLinkU Partner Programs UI', () => {
    const html = read('public/dashboard/index.html');
    const main = read('public/dashboard/main.js');
    const provider = read('public/dashboard/provider-panel.js');
    const safe = read('public/dashboard/safelinku-panel.js');

    expect(html).toContain('provider-panel.js?v=core-controls');
    expect(main).toContain("['provider','Provider'");
    expect(main).toContain("provider: 'provider'");
    expect(provider).toContain('New Provider');
    expect(provider).toContain('SafeLinkU API Key');
    expect(provider).toContain('Generate');
    expect(safe).not.toContain('Partner Programs');
  });
});
