import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relative) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('Layered VM v5 protection mode wiring', () => {
  it('exposes the manifest-sealed VM v5 in the Scripts dashboard', () => {
    const source = read('public/dashboard/scripts-panel.js');
    expect(source).toContain('value="vm-v5"');
    expect(source).toContain('Frezen Layered VM v5 (manifest-sealed)');
    expect(source).toContain('value="vm-v4"');
    expect(source).not.toContain('value="vm-v3"');
  });

  it('exposes VM v5 in both Script Delivery selectors', () => {
    const source = read('public/dashboard/script-delivery-panel.js');
    expect((source.match(/value="vm-v5"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(source).toContain('Frezen Layered VM v5 (manifest-sealed)');
    expect(source).not.toContain('value="vm-v3"');
  });

  it('routes both upload backends to the VM v5 compiler', () => {
    const scripts = read('src/scripts.js');
    const delivery = read('src/script-delivery.js');
    expect(scripts).toContain("mode === 'vm-v5'");
    expect(scripts).toContain('compileFrezenVmV5(source)');
    expect(scripts).toContain('isFrezenVmV5(row.content)');
    expect(delivery).toContain("mode === 'vm-v5'");
    expect(delivery).toContain('compileFrezenVmV5(source)');
    expect(delivery).toContain('isFrezenVmV5(row.content)');
  });

  it('reports the correct VM v5 profile through secure delivery', () => {
    const source = read('src/security/secure-delivery.js');
    expect(source).toContain('isFrezenVmV5(payload)');
    expect(source).toContain('FREZEN_VM_V5_PROFILE');
  });
});
