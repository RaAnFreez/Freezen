import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relative) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('VM v3 protection mode wiring', () => {
  it('exposes VM v3 in the production legacy Scripts dashboard', () => {
    const source = read('public/dashboard/scripts-panel.js');
    expect(source).toContain('value="vm-v3"');
    expect(source).toContain('Frezen VM v3 (virtualized, strongest)');
  });

  it('exposes VM v3 in both Script Delivery protection selectors', () => {
    const source = read('public/dashboard/script-delivery-panel.js');
    expect((source.match(/value="vm-v3"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(source).toContain('Frezen VM v3 (virtualized, strongest)');
  });

  it('accepts VM v3 in the Script Delivery backend', () => {
    const source = read('src/script-delivery.js');
    expect(source).toContain("mode === 'vm-v3'");
    expect(source).toContain("compileProtectedLua = (source, mode) => mode === 'vm-v3'");
    expect(source).toContain("isFrezenVmV3(row.content)");
  });
});
