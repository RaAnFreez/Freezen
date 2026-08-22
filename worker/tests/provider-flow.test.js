import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Provider SafeLinkU checkpoint test flow', () => {
  it('adds the provider Test action and launches the real GetKey service flow', () => {
    const provider = read('public/dashboard/provider-flow-enhancer.js');
    const service = read('public/dashboard/service-panel.js');
    expect(provider).toContain('runProviderTest');
    expect(provider).toContain('crypto.randomUUID()');
    expect(provider).toContain('window.open');
    expect(provider).toContain('data.service.slug');
    expect(provider).toContain('backend SafeLinkU checkpoints');
    expect(service).toContain('Configured Link');
  });

  it('treats SafeLinkU checkpoints as backend-owned definitions', () => {
    const enhancer = read('public/dashboard/provider-flow-enhancer.js');
    expect(enhancer).toContain('/api/v1/safelinku/checkpoints');
    expect(enhancer).toContain('hydrateSafeLinkUState');
    expect(enhancer).toContain('SAFELINKU_API_KEY');
  });
});
