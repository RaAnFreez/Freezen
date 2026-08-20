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
    expect(await response.text()).toBe('INVALID_KEY');
  });

  it('returns generated loader source when the script link is opened directly', async () => {
    const { deliverScriptFileByKey } = await import('../src/script-loader.js');
    const response = await deliverScriptFileByKey(
      new Request('https://frezen.test/files/s1.lua', {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-dest': 'document',
          'user-agent': 'Mozilla/5.0 Chrome/140.0 Safari/537.36',
        },
      }),
      { DB: dbMock('', null) },
      'req-loader-page',
      's1',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    const body = await response.text();
    expect(body).toContain('script_key="PASTE YOUR KEY HERE";');
    expect(body).toContain('https://frezen.test/files/s1.lua?key=');
    expect(body).toContain('&hwid=');
    expect(body).toContain('loadstring(source)();');
  });

  it('returns stored script source for a matching keyed loader request', async () => {
    const { deliverScriptFileByKey } = await import('../src/script-loader.js');
    const key = 'FREZEN-AAAA-BBBB-CCCC-DDDD';
    const keyHash = await hash(key);
    const response = await deliverScriptFileByKey(
      new Request(`https://frezen.test/files/s1.lua?key=${encodeURIComponent(key)}`, {
        headers: { accept: '*/*', 'user-agent': 'FrezenExecutor/1.0' },
      }),
      { DB: dbMock(keyHash, { script_id: 's1', script_status: 'ACTIVE', version: 'v1.0.0', version_status: 'ACTIVE', file_id: 's1', content: 'print("hello")', content_type: 'text/x-lua' }) },
      'req-2',
      's1',
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('print("hello")');
    expect(response.headers.get('x-frezen-file-id')).toBe('s1');
    expect(response.headers.get('content-type')).toContain('text/x-lua');
  });

  it('denies non-navigation file requests without a key', async () => {
    const { deliverScriptFileByKey } = await import('../src/script-loader.js');
    const response = await deliverScriptFileByKey(
      new Request('https://frezen.test/files/s1.lua', { headers: { accept: '*/*', 'user-agent': 'FrezenExecutor/1.0' } }),
      { DB: dbMock('', null) },
      'req-file-2',
      's1',
    );
    expect(response.status).toBe(403);
  });

  it('serves valid file content when Accept is text/html but request is not navigation', async () => {
    const { deliverScriptFileByKey } = await import('../src/script-loader.js');
    const key = 'FREZEN-AAAA-BBBB-CCCC-DDDD';
    const keyHash = await hash(key);
    const response = await deliverScriptFileByKey(
      new Request(`https://frezen.test/files/s1.lua?key=${encodeURIComponent(key)}`, {
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'FrezenExecutor/1.0' },
      }),
      { DB: dbMock(keyHash, { script_id: 's1', script_status: 'ACTIVE', version: 'v1.0.0', version_status: 'ACTIVE', file_id: 's1', content: 'print("hello")', content_type: 'text/x-lua' }) },
      'req-file-3',
      's1',
    );
    expect(response.status).toBe(200);
  });

  it('keeps legacy browser navigation denied with the branded page', async () => {
    const { deliverScriptByKey } = await import('../src/script-loader.js');
    const key = 'FREZEN-AAAA-BBBB-CCCC-DDDD';
    const keyHash = await hash(key);
    const response = await deliverScriptByKey(
      new Request(`https://frezen.test/loader/s1?key=${encodeURIComponent(key)}`, {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-dest': 'document',
          'user-agent': 'Mozilla/5.0 Chrome/140.0 Safari/537.36',
        },
      }),
      { DB: dbMock(keyHash, { script_id: 's1', script_status: 'ACTIVE', version: 'v1.0.0', version_status: 'ACTIVE', content: 'print("hello")', content_type: 'text/x-lua' }) },
      'req-legacy-browser',
      's1',
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('You cant access this link');
  });
});
