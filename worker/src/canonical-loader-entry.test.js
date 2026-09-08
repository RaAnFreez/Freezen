import { describe, expect, it } from 'vitest';
import { canonicalLoaderOrigin, isLoaderRoute, normalizeLoaderRequest } from './canonical-loader-entry.js';

describe('canonical loader origin', () => {
  const env = { FREZEN_ENV: 'production', FREZEN_PUBLIC_ORIGIN: 'https://frezen.frezenapp.workers.dev' };

  it('uses the configured production origin', () => {
    expect(canonicalLoaderOrigin(env, new Request('https://old.example/loader/demo'))).toBe('https://frezen.frezenapp.workers.dev');
  });

  it('recognizes all generated loader delivery routes', () => {
    expect(isLoaderRoute('/loader/demo')).toBe(true);
    expect(isLoaderRoute('/compact-loader/demo')).toBe(true);
    expect(isLoaderRoute('/files/demo.lua')).toBe(true);
    expect(isLoaderRoute('/api/v1/scripts/demo/embedded-loader')).toBe(true);
    expect(isLoaderRoute('/dashboard')).toBe(false);
  });

  it('rewrites loader requests to the canonical origin without changing the path or query', () => {
    const request = new Request('https://old.example/files/demo.lua?key=test');
    const normalized = normalizeLoaderRequest(request, env);
    expect(new URL(normalized.url).origin).toBe('https://frezen.frezenapp.workers.dev');
    expect(new URL(normalized.url).pathname).toBe('/files/demo.lua');
    expect(new URL(normalized.url).search).toBe('?key=test');
  });

  it('leaves unrelated routes unchanged', () => {
    const request = new Request('https://old.example/api/v1/status');
    expect(normalizeLoaderRequest(request, env)).toBe(request);
  });
});
