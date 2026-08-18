import { describe, expect, it } from 'vitest';
import { deliverScriptByKey } from '../src/script-loader.js';

function dbMock() {
  return { prepare: () => ({ bind: () => ({ first: async () => ({ script_id:'s1', script_status:'ACTIVE', version:'1.0.0', version_status:'ARCHIVED', content:'print("ok")', content_type:'text/x-lua' }) }) }) };
}

describe('executor loader delivery', () => {
  it('allows executor requests while keeping browser navigation denied', async () => {
    const db = dbMock();
    const executor = await deliverScriptByKey(new Request('https://frezen.test/loader/s1?key=FREZEN-valid',{headers:{accept:'*/*'}}),{DB:db},'req-1','s1');
    expect(executor.status).toBe(200);
    const browser = await deliverScriptByKey(new Request('https://frezen.test/loader/s1?key=FREZEN-valid',{headers:{accept:'text/html'}}),{DB:db},'req-2','s1');
    expect(browser.status).toBe(403);
  });
});
