import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSafeLinkUCheckpoint } from '../src/safelinku.js';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('SafeLinkU checkpoint link flow', () => {
  it('creates a SafeLinkU checkpoint using a Frezen callback destination', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      'https://safelinku.com/abc123',
      { status: 200, headers: { 'content-type': 'text/plain' } },
    ));
    const result = await createSafeLinkUCheckpoint({ SAFELINKU_API_KEY: 'TOP_SECRET' }, new Request('https://frezen.example/dashboard'), 'checkpoint_1234');
    expect(result.status).toBe('ok');
    expect(result.url).toBe('https://safelinku.com/abc123');
    const [calledUrl, options] = fetchSpy.mock.calls[0];
    expect(options.method).toBe('GET');
    expect(options.body).toBeUndefined();
    const parsed = new URL(calledUrl);
    expect(parsed.searchParams.get('url')).toContain('/api/v1/get-key/checkpoint/callback?checkpoint_id=checkpoint_1234');
    expect(parsed.searchParams.get('api')).toBe('TOP_SECRET');
    fetchSpy.mockRestore();
  });

  it('keeps checkpoint URLs in the dashboard checkpoint records', () => {
    const panel = read('public/dashboard/safelinku-panel.js');
    const provider = read('public/dashboard/provider-flow-enhancer.js');
    expect(panel).toContain('/api/v1/safelinku/checkpoints/create');
    expect(panel).toContain('reference = result.url');
    expect(panel).toContain('checkpoint-url');
    expect(provider).toContain('no SafeLinkU checkpoint URL configured');
    expect(provider).toContain('window.open(target.toString()');
  });

  it('requires the server-side one-time verification token before advancing a checkpoint', () => {
    const entryUi = read('src/entry-ui.js');
    const checkpointFlow = read('src/getkey-checkpoint-flow.js');
    const runtime = read('src/key-system-runtime.js');

    expect(entryUi).toContain('/api/v1/get-key/checkpoint/callback');
    expect(entryUi).toContain('verifyPublicCheckpoint');
    expect(runtime).toContain('consumeCheckpointVerification');
    expect(checkpointFlow).toContain('verification_token_hash');
    expect(checkpointFlow).toContain('prepareCheckpointVerification');
    expect(checkpointFlow).toContain('consumeCheckpointVerification');
    expect(checkpointFlow).toContain('verification_token_hash = NULL');
  });
});
