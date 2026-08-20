import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Service D1 persistence bridge', () => {
  it('loads the persistence bridge and gates script creation on a server sync', () => {
    const bridge = read('public/dashboard/service-d1-persistence.js');
    const html = read('public/dashboard/index.html');

    expect(bridge).toContain("'frezen.services.v1'");
    expect(bridge).toContain("window.FrezenIntegration?.syncToServer");
    expect(bridge).toContain("guardClick('#lua-create')");
    expect(bridge).toContain('Storage.prototype.setItem');
    expect(bridge).toContain('Storage.prototype.removeItem');
    expect(html).toContain('/dashboard/service-d1-persistence.js?v=service-d1-v2');
  });
});
