import { describe, expect, it } from 'vitest';
import { deliverScriptByKey } from '../src/script-loader.js';

function makeDb() {
  return {
    prepare(sql) {
      return {
        bind: (...args) => ({
          first: async () => {
            if (sql.includes('FROM scripts')) {
              return { script_id: 's1', script_status: 'ACTIVE', version: '1.0.0', version_status: 'ARCHIVED', content: 'print("ok")', content_type: 'text/x-lua' };
            }
            return null;
          },
          run: async () => ({ meta: { changes: 1 }, args }),
        }),
      };
    },
  };
}

describe('script loader key fallback', () => {
  it('delivers when only an archived version exists', async () => {
    const response = await deliverScriptByKey(
      new Request('https://frezen.test/loader/s1?key=valid-key', { headers: { accept: '*/*' } }),
      { DB: makeDb() },
      'req-1',
      's1',
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('print');
  });

  it('keeps direct browser navigation denied', async () => {
    const response = await deliverScriptByKey(
      new Request('https://frezen.test/loader/s1?key=valid-key', { headers: { accept: 'text/html' } }),
      { DB: makeDb() },
      'req-2',
      's1',
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('You cant access this link');
  });
});
