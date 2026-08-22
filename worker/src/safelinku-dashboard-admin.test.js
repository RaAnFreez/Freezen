import { describe, expect, it } from 'vitest';

const re = (value) => String(value || '');

describe('SafeLinkU dashboard integration contract', () => {
  it('does not expose an API-key input contract in the dashboard runtime', async () => {
    const fs = await import('node:fs/promises');
    const source = re(await fs.readFile(new URL('../public/dashboard/safelinku-panel.js', import.meta.url), 'utf8'));
    expect(source).not.toContain('id="safelinku-key"');
    expect(source).toContain('SAFELINKU_API_KEY');
    expect(source).toContain('/api/v1/safelinku/test-connection');
  });

  it('uses backend-owned checkpoint endpoints', async () => {
    const fs = await import('node:fs/promises');
    const source = re(await fs.readFile(new URL('../public/dashboard/safelinku-panel.js', import.meta.url), 'utf8'));
    expect(source).toContain('/api/v1/safelinku/checkpoints');
    expect(source).toContain('/api/v1/safelinku/checkpoints/create');
    expect(source).toContain('method: \'DELETE\'');
  });
});
