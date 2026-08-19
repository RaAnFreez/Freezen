import { describe, expect, it } from 'vitest';
import { createKey, keyControlOptions } from '../src/key-control.js';

const request = (body) => new Request('https://frezen.test/api/v1/key-control/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function makeDb() {
  return {
    prepare(sql) {
      const statement = {
        async all() {
          if (sql.includes('PRAGMA table_info(licenses)')) return { results: ['id', 'license_key_hash', 'product_id', 'user_id', 'status', 'expires_at', 'max_devices'].map((name, cid) => ({ name, cid })) };
          return { results: [] };
        },
        bind(...args) {
          return {
            async first() {
              if (sql.includes('FROM frezen_key_providers')) return { id: 'p1', name: 'Fres', type: 'safelinku', service_id: 's1', active: 1 };
              if (sql.includes('FROM frezen_key_services')) return { id: 's1', name: 'Frezen', slug: 'frezen', active: 1 };
              if (sql.includes('FROM frezen_key_folders')) return { id: 'f1', name: 'Default' };
              return null;
            },
            async all() {
              if (sql.includes('frezen_key_providers')) return { results: [{ id: 'p1', name: 'Fres', type: 'safelinku', service_id: 's1' }] };
              if (sql.includes('frezen_key_services')) return { results: [{ id: 's1', name: 'Frezen', slug: 'frezen' }] };
              if (sql.includes('frezen_key_folders')) return { results: [] };
              return { results: [] };
            },
            async run() { return { meta: { changes: 1 }, args }; },
          };
        },
      };
      return statement;
    },
    async batch() { return []; },
  };
}

function makeOptionsDb() {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async all() {
              if (sql.includes('frezen_key_providers')) return { results: [{ id: 'p1', name: 'Fres', type: 'safelinku', service_id: 's1' }] };
              if (sql.includes('frezen_key_services')) return { results: [{ id: 's1', name: 'Frezen', slug: 'frezen' }] };
              if (sql.includes('frezen_key_folders')) return { results: [] };
              return { results: [] };
            },
          };
        },
      };
    },
    async batch() { return []; },
  };
}

describe('Key Control v4', () => {
  it('creates a key linked to provider and service with custom validity', async () => {
    const response = await createKey(request({ provider_id: 'p1', service_id: 's1', days: 0, hours: 1, minutes: 0, max_devices: 2, premium: true }), { DB: makeDb() }, 'req-1', { user_id: 'owner-1' });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.created).toBe(true);
    expect(body.key.provider_id).toBe('p1');
    expect(body.key.service_id).toBe('s1');
    expect(body.key.premium).toBe(true);
    expect(body.license_key).toMatch(/^FREZEN-/);
  });

  it('inherits the provider service when service_id is omitted', async () => {
    const response = await createKey(request({ provider_id: 'p1', days: 1 }), { DB: makeDb() }, 'req-implicit-service', { user_id: 'owner-1' });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.key.provider_id).toBe('p1');
    expect(body.key.service_id).toBe('s1');
  });

  it('returns provider, service and folder options', async () => {
    const response = await keyControlOptions({ DB: makeOptionsDb() }, 'req-2', { user_id: 'owner-1' });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.providers.length).toBe(1);
    expect(body.services.length).toBe(1);
    expect(Array.isArray(body.folders)).toBe(true);
  });
});
