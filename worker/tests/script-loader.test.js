import { describe, expect, it } from 'vitest';
import { buildLoaderSource, deliverScriptByKey } from '../src/script-loader.js';

async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function dbMock(expectedHash, row) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              expect(sql).toContain('frezen_key_records');
              expect(values[0]).toBe(expectedHash);
              return row;
            },
          };
        },
      };
    },
  };
}

describe('Frezen internal keyed script loader', () => {
  it('denies direct access without a key', async () => {
    const response = await deliverScriptByKey(new Request('https://frezen.test/loader/s1'), { DB: dbMock('', null) }, 'req-1', 's1');
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('You cant access this link');
  });

  it('denies browser-style navigation even when a key is present', async () => {
    const key = 'FREZEN-AAAA-BBBB-CCCC-DDDD';
    const keyHash = await hash(key);
    const response = await deliverScriptByKey(
      new Request(`https://frezen.test/loader/s1?key=${encodeURIComponent(key)}`, { headers: { accept: 'text/html,application/xhtml+xml' } }),
      { DB: dbMock(keyHash, { script_id: 's1', script_status: 'ACTIVE', version: 'v1.0.0', version_status: 'ACTIVE', content: 'print("hello")', content_type: 'text/x-lua' }) },
      'req-browser',
      's1',
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('You cant access this link');
  });

  it('returns the active script source for a matching programmatic key request', async () => {
    const key = 'FREZEN-AAAA-BBBB-CCCC-DDDD';
    const keyHash = await hash(key);
    const response = await deliverScriptByKey(
      new Request(`https://frezen.test/loader/s1?key=${encodeURIComponent(key)}`, { headers: { accept: '*/*' } }),
      { DB: dbMock(keyHash, { script_id: 's1', script_status: 'ACTIVE', version: 'v1.0.0', version_status: 'ACTIVE', content: 'print("hello")', content_type: 'text/x-lua' }) },
      'req-2',
      's1',
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('print("hello")');
  });

  it('generates a loader that sends script_key to Frezen', () => {
    const source = buildLoaderSource(new Request('https://frezen.test/dashboard'), 's1');
    expect(source).toContain('script_key="PASTE YOUR KEY HERE";');
    expect(source).toContain('HttpService:UrlEncode(script_key)');
    expect(source).toContain('https://frezen.test/loader/s1?key=');
    expect(source).not.toContain('luarmor');
  });
});
