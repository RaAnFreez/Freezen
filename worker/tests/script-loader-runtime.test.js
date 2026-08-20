import { describe, expect, it } from 'vitest';
import { buildRuntimeLoaderSource } from '../src/short-loader.js';

describe('internal script loader runtime', () => {
  it('builds a runtime Frezen loader using the server-stored .lua file endpoint', () => {
    const source = buildRuntimeLoaderSource(new Request('https://frezen.test/dashboard'), 's1', 'FREZEN-TEST');
    expect(source).toContain('script_key="FREZEN-TEST";');
    expect(source).toContain('https://frezen.test/files/s1.lua?key=');
    expect(source).toContain('HttpService:UrlEncode(script_key)');
    expect(source).toContain('&hwid=');
    expect(source).not.toContain('luarmor');
  });
});
