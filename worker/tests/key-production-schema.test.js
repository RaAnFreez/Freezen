import { describe, expect, it } from 'vitest';
import { createKey, listKeys } from '../src/key-control.js';

const request = (body = {}, url = 'https://frezen.test/api/v1/key-control/keys') => new Request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function makeProductionDb() {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      statements.push(sql);
      return {
        async all() {
          if (sql.includes('PRAGMA table_info(licenses)')) {
            return { results: [
              { name: 'id' },
              { name: 'license_key_hash' },
              { name: 'user_id' },
              { name: 'status' },
              { name: 'expires_at' },
            ] };
          }
          if (sql.includes('SELECT k.id, k.license_id')) {
            if (sql.includes('l.max_devices')) throw new Error('legacy regression: listKeys queried l.max_devices');
            return { results: [{
              id: 'key-1', license_id: 'lic-1', provider_id: 'p1', service_id: 's1', folder_id: null,
              key_name: 'Legacy Key', premium: 0, forever: 0, status: 'active', expires_at: null,
              max_devices: 2, provider_name: 'SafeLinkU', provider_type: 'safelinku', service_name: 'Frezen',
              service_slug: 'frezen', folder_name: null,
            }] };
          }
          return { results: [] };
        },
        bind(...args) {
          return {
            async first() {
              if (sql.includes('FROM frezen_key_providers')) return { id: 'p1', name: 'SafeLinkU', type: 'safelinku', service_id: 's1', active: 1 };
              if (sql.includes('FROM frezen_key_services')) return { id: 's1', name: 'Frezen', slug: 'frezen', active: 1 };
              if (sql.includes('FROM frezen_key_folders')) return null;
              if (sql.includes('COUNT(*) AS total')) return { total: 1 };
              return null;
            },
            async all() {
              return [];
            },
            async run() {
              if (sql.includes('INSERT INTO licenses')) {
                if (args.includes('unused')) throw new Error("CHECK constraint failed: status IN ('active', 'revoked', 'expired')");
                if (!args.includes('active')) throw new Error('regression: license must be created with active status');
              }
              return { meta: { changes: 1 }, args };
            },
          };
        },
      };
    },
    async batch() { return []; },
  };
}

describe('Key Control production D1 compatibility', () => {
  it('creates a key without relying on licenses.max_devices or status=unused', async () => {
    const db = makeProductionDb();
    const response = await createKey(request({ provider_id: 'p1', service_id: 's1', hours: 1, max_devices: 2 }), { DB: db }, 'req-create-production', { user_id: 'owner-1' });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.created).toBe(true);
    expect(body.key.status).toBe('active');
    expect(body.key.max_devices).toBe(2);
  });

  it('loads keys using the Key Control limits table instead of licenses.max_devices', async () => {
    const db = makeProductionDb();
    const response = await listKeys(new Request('https://frezen.test/api/v1/key-control/keys?page=1&page_size=12', { method: 'GET' }), { DB: db }, 'req-list-production', { user_id: 'owner-1' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0].max_devices).toBe(2);
    expect(db.statements.some((sql) => sql.includes('l.max_devices'))).toBe(false);
  });
});
