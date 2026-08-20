import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
describe('Service D1 persistence bridge mount', () => {
  it('is included by dashboard HTML', () => {
    const bridge = read('public/dashboard/service-d1-persistence.js');
    const html = read('public/dashboard/index.html');
    expect(bridge).toContain("window.FrezenIntegration?.syncToServer");
    expect(html).toContain('/dashboard/service-d1-persistence.js?v=service-d1-v1');
  });
});
