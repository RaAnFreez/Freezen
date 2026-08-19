import { describe, expect, it } from 'vitest';
import { buildLoaderSource } from '../src/script-loader.js';

describe('internal script loader runtime', () => {
  it('builds a Frezen loader using the server-stored .lua file endpoint', () => {
    const source = buildLoaderSource(new Request('https://frezen.test/dashboard'), 's1');
    expect(source).toContain('script_key="PASTE YOUR KEY HERE";');
    expect(source).toContain('https://frezen.test/files/s1.lua?key=');
    expect(source).toContain('HttpService:UrlEncode(script_key)');
    expect(source).not.toContain('luarmor');
  });
});
