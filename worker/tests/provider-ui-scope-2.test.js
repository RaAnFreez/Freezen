import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Provider UI scope', () => {
  it('keeps Provider separate from Service-owned configured links and SafeLinkU Partner Programs UI', () => {
    const main = read('public/dashboard/main.js');
    const provider = read('public/dashboard/provider-panel.js');
    const services = read('public/dashboard/service-panel.js');
    const safe = read('public/dashboard/safelinku-panel.js');

    expect(main).toContain("['services','Services'");
    expect(main).toContain("['provider','Provider'");
    expect(provider).toContain('New Provider');
    expect(provider).toContain('Service');
    expect(provider).toContain('Provider type');
    expect(provider).toContain('SafeLinkU integration');
    expect(provider).not.toContain('Custom slug');
    expect(provider).not.toContain('Generated key link');
    expect(provider).not.toContain('/get-key/');
    expect(services).toContain('Configured Link');
    expect(services).toContain('Service Slug');
    expect(services).toContain('/get-key/');
    expect(safe).not.toContain('Partner Programs');
  });
});
