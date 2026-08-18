import { describe, expect, it } from 'vitest';
import { deliverScriptByKey } from '../src/script-loader.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

function makeDb() {
  return {
    prepare(sql) {
      return {
        bind: (...args) => ({
          first: async () => {
            if (sql.includes('SELECT v2.id')) {
              return { id: 'v1', version: '1.0.0', status: 'ARCHIVED' };
            }
            if (sql.includes('FROM scripts')) {
              return {
                script_id: 's1',
                script_status: 'ACTIVE',
                service_id: 'svc1',
                version: '1.0.0',
                version_status: 'ARCHIVED',
                content: 'print("ok")',
                content_type: 'text/x-lua',
              };
            }
            return null;
          },
        }),
      };
    },
  };
}

describe('script loader key/service delivery', () => {
  it('accepts a valid key for a script service even when the first version is archived', async () => {
    const response = await deliverScriptByKey(
      new Request('https://frezen.test/loader/s1?key=FREZEN-valid', { headers: { accept: '*/*', 'user-agent': 'Roblox/WinInet' } }),
      { DB: makeDb() },
      'req-service-1',
      's1',
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('print');
  });

  it('keeps real browser navigation blocked', async () => {
    const response = await deliverScriptByKey(
      new Request('https://frezen.test/loader/s1?key=FREZEN-valid', { headers: { accept: 'text/html,application/xhtml+xml' } }),
      { DB: makeDb() },
      'req-service-2',
      's1',
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('You cant access this link');
  });

  it('returns 503 for a database failure instead of masking it as an invalid key', async () => {
    const failingDb = {
      prepare() {
        return { bind: () => ({ first: async () => { throw new Error('D1 failure'); } }) };
      },
    };
    const response = await deliverScriptByKey(
      new Request('https://frezen.test/loader/s1?key=FREZEN-valid', { headers: { accept: '*/*' } }),
      { DB: failingDb },
      'req-service-3',
      's1',
    );
    expect(response.status).toBe(503);
  });
});
