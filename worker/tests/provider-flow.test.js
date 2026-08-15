import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Provider SafeLinkU checkpoint test flow', () => {
  it('adds the provider Test action without moving Configured Link out of Services', () => {
    const provider = read('worker/public/dashboard/provider-flow-enhancer.js');
    const service = read('worker/public/dashboard/service-panel.js');
    expect(provider).toContain("/api/v1/safelinku/test-connection");
    expect(provider).toContain("crypto.randomUUID()");
    expect(provider).toContain('window.open');
    expect(provider).toContain('frezen_flow');
    expect(service).toContain('Configured Link');
  });

  it('treats the SafeLinkU checkpoint field as the actual HTTPS checkpoint URL', () => {
    const enhancer = read('worker/public/dashboard/safelinku-checkpoint-enhancer.js');
    expect(enhancer).toContain('SafeLinkU checkpoint URL');
    expect(enhancer).toContain('https://safelinku.com/...');
    expect(enhancer).toContain('Use the HTTPS SafeLinkU checkpoint URL.');
  });
});
