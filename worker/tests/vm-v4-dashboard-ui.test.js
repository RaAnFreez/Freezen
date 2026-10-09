import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relative) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('Layered VM v4 protection mode wiring', () => {
  it('exposes VM v4 in the production Scripts dashboard', () => {
    const source = read('public/dashboard/scripts-panel.js');
    expect(source).toContain('value="vm-v4"');
    expect(source).toContain('Frezen Layered VM v4 (two-stage, compatibility-first)');
    expect(source).not.toContain('value="vm-v3"');
  });

  it('exposes VM v4 in both Script Delivery protection selectors', () => {
    const source = read('public/dashboard/script-delivery-panel.js');
    expect((source.match(/value="vm-v4"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(source).toContain('Frezen Layered VM v4 (two-stage, compatibility-first)');
    expect(source).not.toContain('value="vm-v3"');
  });

  it('routes VM v4 requests to the layered compiler', () => {
    const source = read('src/script-delivery.js');
    expect(source).toContain("mode === 'vm-v4'");
    expect(source).toContain('compileFrezenVmV4(source)');
    expect(source).toContain('isFrezenVmV4(row.content)');
  });

  it('keeps an old vm-v3 form submission compatible by selecting the replacement', () => {
    const source = read('src/script-delivery.js');
    expect(source).toContain("['vm-v1', 'vm-v2', 'vm-v3', 'vm-v4'].includes(mode)");
  });
});
