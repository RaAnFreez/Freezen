import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSafeLinkUCheckpoint } from '../src/safelinku.js';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('SafeLinkU checkpoint link flow', () => {
  it('creates a SafeLinkU checkpoint using a Frezen callback destination', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ url: 'https://safelinku.com/abc123' }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ));
    const result = await createSafeLinkUCheckpoint({ SAFELINKU_API_KEY: 'TOP_SECRET' }, new Request('https://frezen.example/dashboard'), 'checkpoint_1234');
    expect(result.status).toBe('ok');
    expect(result.url).toBe('https://safelinku.com/abc123');
    const request = fetchSpy.mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body.url).toContain('/api/v1/get-key/checkpoint/callback?checkpoint_id=checkpoint_1234');
    expect(request.headers.authorization).toBe('Bearer TOP_SECRET');
    fetchSpy.mockRestore();
  });

  it('keeps checkpoint URLs in the dashboard checkpoint records', () => {
    const panel = read('public/dashboard/safelinku-panel.js');
    const provider = read('public/dashboard/provider-flow-enhancer.js');
    expect(panel).toContain('/api/v1/safelinku/checkpoints/create');
    expect(panel).toContain('reference = result.url');
    expect(panel).toContain('checkpoint-url');
    expect(provider).toContain('configured SafeLinkU checkpoint URL');
    expect(provider).toContain('window.open(target.toString()');
  });

  it('does not mark callback completion as verified without a trusted SafeLinkU signal', () => {
    const entryUi = read('src/entry-ui.js');
    expect(entryUi).toContain('verified: false');
    expect(entryUi).toContain('trusted SafeLinkU completion signal');
  });
});
