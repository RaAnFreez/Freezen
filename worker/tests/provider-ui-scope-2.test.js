import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
describe('Provider UI scope', () => {
  it('keeps Provider focused and SafeLinkU free of Partner Programs UI', () => {
    const main = read('public/dashboard/main.js');
    const provider = read('public/dashboard/provider-panel.js');
    const safe = read('public/dashboard/safelinku-panel.js');
    expect(main).toContain("['provider','Provider'");
    expect(provider).toContain('New Provider');
    expect(provider).toContain('SafeLinkU API Key');
    expect(provider).toContain('Generate');
    expect(safe).not.toContain('Partner Programs');
  });
});
