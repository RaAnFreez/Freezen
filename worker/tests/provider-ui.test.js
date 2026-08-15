import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Provider and Service dashboard scope', () => {
  it('keeps configured key links owned by Service and Provider free of link configuration', () => {
    const html = read('public/dashboard/index.html');
    const main = read('public/dashboard/main.js');
    const provider = read('public/dashboard/provider-panel.js');
    const services = read('public/dashboard/service-panel.js');
    const safe = read('public/dashboard/safelinku-panel.js');

    expect(html).toContain('provider-panel.js?v=service-provider-separation-1');
    expect(html).toContain('service-panel.js?v=service-provider-separation-1');
    expect(main).toContain("['provider','Provider'");
    expect(main).toContain("['services','Services'");
    expect(main).toContain("services: 'services'");
    expect(main).toContain("provider: 'provider'");

    expect(provider).toContain('New Provider');
    expect(provider).toContain('service_id');
    expect(provider).toContain('SafeLinkU integration');
    expect(provider).not.toContain('Custom slug');
    expect(provider).not.toContain('Generated key link');
    expect(provider).not.toContain('/get-key/');

    expect(services).toContain('New Service');
    expect(services).toContain('Service Slug');
    expect(services).toContain('Configured Link');
    expect(services).toContain('/get-key/');
    expect(services).toContain('Copy');
    expect(services).toContain('Keyless Mode');

    expect(safe).not.toContain('Partner Programs');
  });
});
