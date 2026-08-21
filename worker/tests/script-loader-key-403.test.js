import { describe, expect, it } from 'vitest';
import { deliverScriptByKey, deliverScriptFileByKey } from '../src/script-loader.js';

function dbMock() {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('FROM scripts s')) return { script_id: args[1], script_status: 'ACTIVE', version: 'v1.0.0', version_status: 'ACTIVE', file_id: 's1', content: 'print("hello")', content_type: 'text/x-lua', license_id: 'lic-1', license_user_id: 'owner-1', license_status: 'active', license_expires_at: null };
              if (sql.includes('FROM licenses l')) return { id: 'lic-1', user_id: null, key_owner_id: 'owner-1', status: 'active', expires_at: null };
              if (sql.includes('FROM frezen_key_limits')) return { max_devices: 1 };
              if (sql.includes("status = 'blocked'")) return null;
              if (sql.includes('hwid_bindings_v2 WHERE license_id')) return null;
              if (sql.includes('COUNT(*)')) return { total: 0 };
              return null;
            },
            async run() { return { meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
}

describe('script loader server-file delivery regression', () => {
  it('returns Lua source for a server-file style GET with a key', async () => {
    const response = await deliverScriptFileByKey(new Request('https://frezen.test/files/s1.lua?key=FREZEN-valid&hwid=CI-TEST-DEVICE', { headers: { accept: '*/*', 'user-agent': 'FrezenClient/1.0' } }), { DB: dbMock() }, 'req-file-1', 's1');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/x-lua');
    expect(await response.text()).toContain('print');
  });

  it('serves the legacy loader when its explicit raw marker is present', async () => {
    const response = await deliverScriptByKey(new Request('https://frezen.test/loader/s1?format=raw&key=FREZEN-valid&hwid=CI-TEST-DEVICE', { headers: { accept: '*/*' } }), { DB: dbMock() }, 'req-raw-1', 's1');
    expect(response.status).toBe(200);
  });

  it('denies legacy browser navigation without the raw marker', async () => {
    const response = await deliverScriptByKey(new Request('https://frezen.test/loader/s1?key=FREZEN-valid', { headers: { accept: 'text/html,application/xhtml+xml', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'user-agent': 'Mozilla/5.0 Chrome/140.0 Safari/537.36' } }), { DB: dbMock() }, 'req-legacy-1', 's1');
    expect(response.status).toBe(403);
  });

  it('denies the server-file URL without a key when it is not a browser navigation', async () => {
    const response = await deliverScriptFileByKey(new Request('https://frezen.test/files/s1.lua', { headers: { accept: '*/*', 'user-agent': 'FrezenClient/1.0' } }), { DB: dbMock() }, 'req-file-2', 's1');
    expect(response.status).toBe(403);
  });

  it('returns loader source instead of blocking direct server-file browser navigation', async () => {
    const response = await deliverScriptFileByKey(new Request('https://frezen.test/files/s1.lua', { headers: { accept: 'text/html,application/xhtml+xml', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'user-agent': 'Mozilla/5.0 Chrome/140.0 Safari/537.36' } }), { DB: dbMock() }, 'req-file-3', 's1');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('PASTE YOUR KEY HERE');
  });
});
