import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Provider UI scope', () => {
  it('keeps Provider as the key-system layer and SafeLinkU free of Partner Programs UI', () => {
    const main = read('public/dashboard/main.js');
    const provider = read('public/dashboard/provider-panel.js');
    const safe = read('public/dashboard/safelinku-panel.js');

    expect(main).toContain("['services','Services'");
    expect(main).toContain("['provider','Provider'");

    expect(provider).toContain('New Provider');
    expect(provider).toContain('Service');
    expect(provider).toContain('Provider type');
    expect(provider).toContain('Custom slug');
    expect(provider).toContain('Generated key link');
    expect(provider).toContain('SafeLinkU integration');
    expect(provider).not.toContain('SafeLinkU API Key');
    expect(provider).not.toContain('Generate');

    expect(safe).toContain('SafeLinkU API Key');
    expect(safe).toContain('Salt');
    expect(safe).not.toContain('Partner Programs');
  });
});
