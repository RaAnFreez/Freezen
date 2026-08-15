import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
const hasDashboardAsset = (html, asset) => new RegExp(`/dashboard/${asset}\\?v=provider-getkey-v\\d+`).test(html);

describe('Provider, Services and SafeLinkU dashboard scope', () => {
  it('keeps configured key links owned by Service and Provider free of link configuration', () => {
    const html = read('public/dashboard/index.html');
    const main = read('public/dashboard/main.js');
    const provider = read('public/dashboard/provider-panel.js');
    const services = read('public/dashboard/service-panel.js');
    const safe = read('public/dashboard/safelinku-panel.js');

    expect(hasDashboardAsset(html, 'provider-panel.js')).toBe(true);
    expect(hasDashboardAsset(html, 'service-panel.js')).toBe(true);
    expect(main).toContain("['provider','Provider'");
    expect(main).toContain("['services','Services'");
    expect(provider).not.toContain('Custom slug');
    expect(provider).not.toContain('Generated key link');
    expect(provider).not.toContain('/get-key/');
    expect(provider).toContain('SafeLinkU integration');
    expect(provider).toContain('service_id');
    expect(services).toContain('Configured Link');
    expect(services).toContain('/get-key/');
    expect(services).toContain('Service Slug');
    expect(services).toContain('Premium Service');
    expect(services).toContain('Keyless Mode');
    expect(safe).not.toContain('Partner Programs');
  });
});
