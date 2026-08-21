import { describe, expect, it } from 'vitest';
import { deliverScriptByKey } from '../src/script-loader.js';

function dbMock() {
  return {
    prepare: (sql) => ({
      bind: (...args) => ({
        first: async () => {
          if (sql.includes('JOIN frezen_key_records')) {
            return {
              script_id: args[1] ?? 's1',
              script_status: 'ACTIVE',
              version: '1.0.0',
              version_status: 'ARCHIVED',
              content: 'print("ok")',
              content_type: 'text/x-lua',
              license_id: 'lic-1',
              license_user_id: 'owner-1',
              key_record_id: 'key-1',
            };
          }
          if (sql.includes('FROM licenses l') && sql.includes('frezen_key_records kr')) {
            return { id: 'lic-1', user_id: 'owner-1', key_owner_id: 'owner-1', status: 'active', expires_at: null };
          }
          if (sql.includes('COUNT(*)') && sql.includes('hwid_bindings_v2')) return { total: 0 };
          return null;
        },
        run: async () => ({ meta: { changes: 1 } }),
      }),
    }),
  };
}

describe('script loader delivery', () => {
  it('allows a valid runtime request while keeping browser navigation denied', async () => {
    const db = dbMock();
    const runtime = await deliverScriptByKey(
      new Request('https://frezen.test/loader/s1?key=FREZEN-valid&hwid=CI-TEST-DEVICE', {
        headers: { accept: '*/*' },
      }),
      { DB: db },
      'req-1',
      's1',
    );
    expect(runtime.status).toBe(200);

    const browser = await deliverScriptByKey(
      new Request('https://frezen.test/loader/s1?key=FREZEN-valid', {
        headers: { accept: 'text/html' },
      }),
      { DB: db },
      'req-2',
      's1',
    );
    expect(browser.status).toBe(403);
  });
});
