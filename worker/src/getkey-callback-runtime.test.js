import { describe, expect, it, vi } from 'vitest';
import { verifyGetKeyCheckpointCallback } from './getkey-callback-runtime.js';

function sha256Hex(value) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  );
}

describe('Get-Key callback production license schema', () => {
  it('does not insert the unsupported product_id column when all checkpoints pass', async () => {
    const token = 'A'.repeat(40);
    const tokenHash = await sha256Hex(token);
    const queries = [];
    const db = {
      prepare(sql) {
        queries.push(sql);
        return {
          bind() {
            return {
              async first() {
                if (sql.includes('FROM getkey_public_checkpoints c')) {
                  return {
                    id: 'cp-row', session_id: 'flow-1', checkpoint_id: 'cp-1', status: 'pending',
                    token_expires_at: new Date(Date.now() + 60_000).toISOString(),
                    service_id: 'svc-1', session_expires_at: new Date(Date.now() + 60_000).toISOString(),
                    verify_token_hash: tokenHash,
                  };
                }
                if (sql.includes('SELECT * FROM getkey_public_keys')) return null;
                if (sql.includes('SELECT slug FROM frezen_key_services')) return { slug: 'demo' };
                return null;
              },
              async run() { return { meta: { changes: 1 } }; },
              async all() { return { results: [{ checkpoint_id: 'cp-1', status: 'passed' }] }; },
            };
          },
        };
      },
    };

    const response = await verifyGetKeyCheckpointCallback(
      new Request('https://frezen.example/api/v1/get-key/checkpoint/callback?token=' + token, {
        headers: { cookie: 'frezen_getkey_session=flow-1' },
      }),
      { DB: db, FREZEN_MASTER_SECRET: 'test-secret' },
      token,
    );

    expect(response.status).toBe(302);
    const licenseInsert = queries.find((sql) => sql.includes('INSERT INTO licenses'));
    expect(licenseInsert).toContain('license_key_hash, user_id, status');
    expect(licenseInsert).not.toContain('product_id');
  });
});
