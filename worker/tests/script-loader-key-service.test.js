import { describe, expect, it } from 'vitest';
import { deliverScriptByKey } from '../src/script-loader.js';

function makeDb() {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            first: async () => {
              if (sql.includes('FROM scripts s')) return { script_id: args[1], script_status: 'ACTIVE', service_id: 'svc1', version: '1.0.0', version_status: 'ARCHIVED', content: 'print("ok")', content_type: 'text/x-lua', license_id: 'lic-1', license_user_id: 'owner-1', license_status: 'active', license_expires_at: null };
              if (sql.includes('FROM licenses l')) return { id: 'lic-1', user_id: null, key_owner_id: 'owner-1', status: 'active', expires_at: null };
              if (sql.includes('FROM frezen_key_limits')) return { max_devices: 1 };
              if (sql.includes("status = 'blocked'")) return null;
              if (sql.includes('hwid_bindings_v2 WHERE license_id')) return null;
              if (sql.includes('COUNT(*)')) return { total: 0 };
              return null;
            },
            run: async () => ({ meta: { changes: 1 } }),
          };
        },
      };
    },
  };
}

describe('script loader key/service delivery', () => {
  it('accepts a valid key when the selected version is archived', async () => {
    const response = await deliverScriptByKey(new Request('https://frezen.test/loader/s1?key=FREZEN-valid&hwid=CI-TEST-DEVICE', { headers: { accept: '*/*', 'user-agent': 'FrezenClient/1.0' } }), { DB: makeDb() }, 'req-service-1', 's1');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('print');
  });

  it('keeps real browser navigation blocked', async () => {
    const response = await deliverScriptByKey(new Request('https://frezen.test/loader/s1?key=FREZEN-valid', { headers: { accept: 'text/html,application/xhtml+xml', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'user-agent': 'Mozilla/5.0 Chrome/140.0 Safari/537.36' } }), { DB: makeDb() }, 'req-service-2', 's1');
    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('You cant access this link');
  });

  it('returns 503 for a database failure instead of masking it as an invalid key', async () => {
    const failingDb = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('D1 failure'); } }) }) };
    const response = await deliverScriptByKey(new Request('https://frezen.test/loader/s1?key=FREZEN-valid&hwid=CI-TEST-DEVICE', { headers: { accept: '*/*' } }), { DB: failingDb }, 'req-service-3', 's1');
    expect(response.status).toBe(503);
  });
});
