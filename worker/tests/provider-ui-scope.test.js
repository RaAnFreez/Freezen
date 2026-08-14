import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Provider, Services and SafeLinkU dashboard scope', () => {
  it('keeps Provider focused on key links and removes Partner Programs UI', () => {
    const html = read('public/dashboard/index.html');
    const main = read('public/dashboard/main.js');
    const provider = read('public/dashboard/provider-panel.js');
    const services = read('public/dashboard/service-panel.js');
    const safe = read('public/dashboard/safelinku-panel.js');

    expect(html).toContain('provider-panel.js?v=core-controls');
    expect(html).toContain('service-panel.js?v=core-controls');
    expect(main).toContain("['provider','Provider'");
    expect(main).toContain("['services','Services'");
    expect(provider).toContain('Custom slug');
    expect(provider).toContain('Generated key link');
    expect(provider).toContain('SafeLinkU integration');
    expect(provider).toContain('service_id');
    expect(services).toContain('Premium Service');
    expect(services).toContain('Keyless Mode');
    expect(safe).not.toContain('Partner Programs');
  });
});
