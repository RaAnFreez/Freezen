import { describe, expect, it } from 'vitest';

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

describe('Frezen server-file keyed script delivery', () => {
  it('denies direct access without a key', async () => {
    const { deliverScriptFileByKey } = await import('../src/script-loader.js');
    const response = await deliverScriptFileByKey(new Request('https://frezen.test/files/s1.lua'), { DB: dbMock('', null) }, 'req-1', 's1');
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('You cant access this link');
  });

  it('does not reject a keyed server-file request because of a browser-like Accept header', async () => {
    const { deliverScriptFileByKey } = await import('../src/script-loader.js');
    const key = 'FREZEN-AAAA-BBBB-CCCC-DDDD';
    const keyHash = await hash(key);
    const response = await deliverScriptFileByKey(
      new Request(`https://frezen.test/files/s1.lua?key=${encodeURIComponent(key)}`, { headers: { accept: 'text/html,application/xhtml+xml' } }),
      { DB: dbMock(keyHash, { script_id: 's1', script_status: 'ACTIVE', version: 'v1.0.0', version_status: 'ACTIVE', file_id: 's1', content: 'print("hello")', content_type: 'text/x-lua' }) },
      'req-browser-file',
      's1',
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('print("hello")');
  });

  it('returns the stored script source for a matching keyed file request', async () => {
    const { deliverScriptFileByKey } = await import('../src/script-loader.js');
    const key = 'FREZEN-AAAA-BBBB-CCCC-DDDD';
    const keyHash = await hash(key);
    const response = await deliverScriptFileByKey(
      new Request(`https://frezen.test/files/s1.lua?key=${encodeURIComponent(key)}`, { headers: { accept: '*/*' } }),
      { DB: dbMock(keyHash, { script_id: 's1', script_status: 'ACTIVE', version: 'v1.0.0', version_status: 'ACTIVE', file_id: 's1', content: 'print("hello")', content_type: 'text/x-lua' }) },
      'req-2',
      's1',
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('print("hello")');
    expect(response.headers.get('x-frezen-file-id')).toBe('s1');
    expect(response.headers.get('content-type')).toContain('text/x-lua');
  });

  it('keeps legacy browser navigation denied', async () => {
    const { deliverScriptByKey } = await import('../src/script-loader.js');
    const key = 'FREZEN-AAAA-BBBB-CCCC-DDDD';
    const keyHash = await hash(key);
    const response = await deliverScriptByKey(
      new Request(`https://frezen.test/loader/s1?key=${encodeURIComponent(key)}`, { headers: { accept: 'text/html,application/xhtml+xml' } }),
      { DB: dbMock(keyHash, { script_id: 's1', script_status: 'ACTIVE', version: 'v1.0.0', version_status: 'ACTIVE', content: 'print("hello")', content_type: 'text/x-lua' }) },
      'req-legacy-browser',
      's1',
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('You cant access this link');
  });
});
