import { describe, expect, it } from 'vitest';
import { deliverScriptByKey } from '../src/script-loader.js';

function dbMock() {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => ({
          script_id: 's1',
          script_status: 'ACTIVE',
          version: '1.0.0',
          version_status: 'ARCHIVED',
          content: 'print("ok")',
          content_type: 'text/x-lua',
        }),
      }),
    }),
  };
}

describe('script loader raw delivery regression', () => {
  it('returns Lua source for an explicit raw GET with a key', async () => {
    const response = await deliverScriptByKey(
      new Request('https://frezen.test/loader/s1?format=raw&key=FREZEN-valid', {
        headers: { accept: '*/*', 'user-agent': 'Roblox/WinInet' },
      }),
      { DB: dbMock() },
      'req-1',
      's1',
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('print');
  });

  it('denies browser navigation without the raw marker', async () => {
    const response = await deliverScriptByKey(
      new Request('https://frezen.test/loader/s1?key=FREZEN-valid', {
        headers: { accept: 'text/html,application/xhtml+xml' },
      }),
      { DB: dbMock() },
      'req-2',
      's1',
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('You cant access this link');
  });
});
