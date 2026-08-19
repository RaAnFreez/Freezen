import { describe, expect, it } from 'vitest';
import { deliverScriptByKey, deliverScriptFileByKey } from '../src/script-loader.js';

function dbMock() {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => ({
          script_id: 's1',
          script_status: 'ACTIVE',
          version: '1.0.0',
          version_status: 'ARCHIVED',
          file_id: 'f1',
          content: 'print("ok")',
          content_type: 'text/x-lua',
        }),
      }),
    }),
  };
}

describe('script loader server-file delivery regression', () => {
  it('returns Lua source for a server-file style GET with a key', async () => {
    const response = await deliverScriptFileByKey(
      new Request('https://frezen.test/files/s1.lua?key=FREZEN-valid', {
        headers: { accept: '*/*', 'user-agent': 'Roblox/WinInet' },
      }),
      { DB: dbMock() },
      'req-file-1',
      's1',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/x-lua');
    expect(await response.text()).toContain('print');
  });

  it('continues serving the legacy loader only when format=raw is explicit', async () => {
    const response = await deliverScriptByKey(
      new Request('https://frezen.test/loader/s1?format=raw&key=FREZEN-valid', {
        headers: { accept: '*/*' },
      }),
      { DB: dbMock() },
      'req-raw-1',
      's1',
    );
    expect(response.status).toBe(200);
  });

  it('denies the legacy loader without the raw marker', async () => {
    const response = await deliverScriptByKey(
      new Request('https://frezen.test/loader/s1?key=FREZEN-valid', {
        headers: { accept: 'text/html,application/xhtml+xml' },
      }),
      { DB: dbMock() },
      'req-legacy-1',
      's1',
    );
    expect(response.status).toBe(403);
  });

  it('denies the server-file URL without a key', async () => {
    const response = await deliverScriptFileByKey(
      new Request('https://frezen.test/files/s1.lua', { headers: { accept: '*/*' } }),
      { DB: dbMock() },
      'req-file-2',
      's1',
    );
    expect(response.status).toBe(403);
  });

  it('does not depend on a browser Accept header for the file URL when the key is valid', async () => {
    const response = await deliverScriptFileByKey(
      new Request('https://frezen.test/files/s1.lua?key=FREZEN-valid', {
        headers: { accept: 'text/html,application/xhtml+xml' },
      }),
      { DB: dbMock() },
      'req-file-3',
      's1',
    );
    expect(response.status).toBe(200);
  });
});
